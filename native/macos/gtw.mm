// Get To Work native bridge: EventKit access + screen-covering alert windows.
// Built as a dylib and loaded from the Bun main process via bun:ffi.
// All AppKit calls are marshalled onto the main thread.

#import <Cocoa/Cocoa.h>
#import <EventKit/EventKit.h>
#import <WebKit/WebKit.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <objc/runtime.h>

static EKEventStore *gStore = nil;
static id gStoreObserver = nil;
static atomic_int gStoreChanged = 0;

static void run_on_main(dispatch_block_t block) {
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_sync(dispatch_get_main_queue(), block);
    }
}

static char *dup_json(id obj) {
    NSError *err = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:obj options:0 error:&err];
    if (!data) {
        NSString *msg = [NSString stringWithFormat:@"{\"error\":\"%@\"}", err.localizedDescription ?: @"json"];
        return strdup(msg.UTF8String);
    }
    NSString *s = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return strdup(s.UTF8String);
}

static id nz(id v) { return v ?: [NSNull null]; }

static double ms(NSDate *d) { return d ? [d timeIntervalSince1970] * 1000.0 : 0; }

static EKEventStore *get_store(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        gStore = [[EKEventStore alloc] init];
        gStoreObserver = [[NSNotificationCenter defaultCenter]
            addObserverForName:EKEventStoreChangedNotification
                        object:gStore
                         queue:nil
                    usingBlock:^(NSNotification *n) { atomic_store(&gStoreChanged, 1); }];
    });
    return gStore;
}

static NSString *color_hex(CGColorRef c) {
    if (!c) return nil;
    NSColor *ns = [[NSColor colorWithCGColor:c] colorUsingColorSpace:[NSColorSpace sRGBColorSpace]];
    if (!ns) return nil;
    return [NSString stringWithFormat:@"#%02X%02X%02X",
            (int)lround(ns.redComponent * 255), (int)lround(ns.greenComponent * 255), (int)lround(ns.blueComponent * 255)];
}

extern "C" {

// ---------- EventKit ----------

// 0 notDetermined, 1 restricted, 2 denied, 3 fullAccess, 4 writeOnly
int gtw_calendar_auth_status(void) {
    return (int)[EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
}

void gtw_calendar_request_access(void) {
    EKEventStore *store = get_store();
    [store requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError *error) {
        atomic_store(&gStoreChanged, 1);
    }];
}

int gtw_store_changed(void) {
    return atomic_exchange(&gStoreChanged, 0);
}

char *gtw_calendars_json(void) {
    EKEventStore *store = get_store();
    NSMutableArray *out = [NSMutableArray array];
    for (EKCalendar *cal in [store calendarsForEntityType:EKEntityTypeEvent]) {
        [out addObject:@{
            @"id": nz(cal.calendarIdentifier),
            @"title": nz(cal.title),
            @"colorHex": nz(color_hex(cal.CGColor)),
            @"sourceTitle": nz(cal.source.title),
            @"sourceType": @((int)cal.source.sourceType),
            @"type": @((int)cal.type),
            @"allowsModifications": @(cal.allowsContentModifications),
            @"isSubscribed": @(cal.subscribed),
        }];
    }
    return dup_json(out);
}

char *gtw_events_json(double startMs, double endMs) {
    EKEventStore *store = get_store();
    NSDate *start = [NSDate dateWithTimeIntervalSince1970:startMs / 1000.0];
    NSDate *end = [NSDate dateWithTimeIntervalSince1970:endMs / 1000.0];
    NSPredicate *pred = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
    NSArray<EKEvent *> *events = [store eventsMatchingPredicate:pred];
    NSMutableArray *out = [NSMutableArray array];
    for (EKEvent *ev in events) {
        int selfStatus = -1;
        int attendeeCount = 0;
        if (ev.attendees) {
            attendeeCount = (int)ev.attendees.count;
            for (EKParticipant *p in ev.attendees) {
                if (p.isCurrentUser) { selfStatus = (int)p.participantStatus; break; }
            }
        }
        [out addObject:@{
            @"id": nz(ev.eventIdentifier),
            @"calendarId": nz(ev.calendar.calendarIdentifier),
            @"title": nz(ev.title),
            @"start": @(ms(ev.startDate)),
            @"end": @(ms(ev.endDate)),
            @"allDay": @(ev.allDay),
            @"location": nz(ev.location),
            @"notes": nz(ev.notes),
            @"url": nz(ev.URL.absoluteString),
            @"status": @((int)ev.status),
            @"selfStatus": @(selfStatus),
            @"organizerName": nz(ev.organizer.name),
            @"organizerIsSelf": @(ev.organizer ? ev.organizer.isCurrentUser : NO),
            @"attendeeCount": @(attendeeCount),
            @"hasRecurrence": @(ev.hasRecurrenceRules),
            @"isDetached": @(ev.isDetached),
            @"availability": @((int)ev.availability),
        }];
    }
    return dup_json(out);
}

// Dev helper: create an event so alerts can be tested end to end. Returns {"id":...} or {"error":...}.
char *gtw_create_event_json(const char *title, double startMs, double endMs, const char *location, const char *calendarId, const char *notes, const char *url) {
    EKEventStore *store = get_store();
    EKCalendar *cal = nil;
    if (calendarId && strlen(calendarId) > 0) cal = [store calendarWithIdentifier:[NSString stringWithUTF8String:calendarId]];
    if (!cal) cal = store.defaultCalendarForNewEvents;
    if (!cal) {
        for (EKCalendar *c in [store calendarsForEntityType:EKEntityTypeEvent]) {
            if (c.allowsContentModifications) { cal = c; break; }
        }
    }
    if (!cal) return dup_json(@{@"error": @"no writable calendar"});
    EKEvent *ev = [EKEvent eventWithEventStore:store];
    ev.title = [NSString stringWithUTF8String:title ?: "Test"];
    ev.startDate = [NSDate dateWithTimeIntervalSince1970:startMs / 1000.0];
    ev.endDate = [NSDate dateWithTimeIntervalSince1970:endMs / 1000.0];
    if (location && strlen(location) > 0) ev.location = [NSString stringWithUTF8String:location];
    if (notes && strlen(notes) > 0) ev.notes = [NSString stringWithUTF8String:notes];
    if (url && strlen(url) > 0) ev.URL = [NSURL URLWithString:[NSString stringWithUTF8String:url]];
    ev.calendar = cal;
    NSError *err = nil;
    if (![store saveEvent:ev span:EKSpanThisEvent commit:YES error:&err]) {
        return dup_json(@{@"error": err.localizedDescription ?: @"save failed"});
    }
    atomic_store(&gStoreChanged, 1);
    return dup_json(@{@"id": nz(ev.eventIdentifier), @"calendar": nz(cal.title)});
}

char *gtw_delete_event_json(const char *eventId) {
    EKEventStore *store = get_store();
    EKEvent *ev = [store eventWithIdentifier:[NSString stringWithUTF8String:eventId ?: ""]];
    if (!ev) return dup_json(@{@"error": @"not found"});
    NSError *err = nil;
    BOOL ok = [store removeEvent:ev span:EKSpanThisEvent commit:YES error:&err];
    atomic_store(&gStoreChanged, 1);
    return dup_json(ok ? @{@"ok": @YES} : @{@"error": err.localizedDescription ?: @"remove failed"});
}

void gtw_free(char *p) { free(p); }

// ---------- Windows ----------

// Windows are created by Electrobun, so we can't subclass ahead of time. Instead we swizzle the window's
// class once and consult a per-instance "alert" flag: alert windows ignore AppKit's menu-bar frame
// constraint and can always become key/main; every other window keeps the original behaviour.
static const void *kGTWAlertFlagKey = &kGTWAlertFlagKey;

static BOOL gtw_is_alert(id win) {
    return [objc_getAssociatedObject(win, kGTWAlertFlagKey) boolValue];
}

typedef NSRect (*ConstrainIMP)(id, SEL, NSRect, NSScreen *);
typedef BOOL (*BoolIMP)(id, SEL);
static ConstrainIMP gOrigConstrain = NULL;
static BoolIMP gOrigCanKey = NULL;
static BoolIMP gOrigCanMain = NULL;

static NSRect gtw_constrainFrameRect(id self, SEL _cmd, NSRect frameRect, NSScreen *screen) {
    if (gtw_is_alert(self)) return frameRect;
    return gOrigConstrain ? gOrigConstrain(self, _cmd, frameRect, screen) : frameRect;
}
static BOOL gtw_canBecomeKeyWindow(id self, SEL _cmd) {
    if (gtw_is_alert(self)) return YES;
    return gOrigCanKey ? gOrigCanKey(self, _cmd) : YES;
}
static BOOL gtw_canBecomeMainWindow(id self, SEL _cmd) {
    if (gtw_is_alert(self)) return YES;
    return gOrigCanMain ? gOrigCanMain(self, _cmd) : YES;
}

static void swizzle_once(Class cls) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Method m1 = class_getInstanceMethod(cls, @selector(constrainFrameRect:toScreen:));
        gOrigConstrain = (ConstrainIMP)method_getImplementation(m1);
        if (!class_addMethod(cls, @selector(constrainFrameRect:toScreen:), (IMP)gtw_constrainFrameRect, method_getTypeEncoding(m1))) {
            method_setImplementation(m1, (IMP)gtw_constrainFrameRect);
        }
        Method m2 = class_getInstanceMethod(cls, @selector(canBecomeKeyWindow));
        gOrigCanKey = (BoolIMP)method_getImplementation(m2);
        if (!class_addMethod(cls, @selector(canBecomeKeyWindow), (IMP)gtw_canBecomeKeyWindow, method_getTypeEncoding(m2))) {
            method_setImplementation(m2, (IMP)gtw_canBecomeKeyWindow);
        }
        Method m3 = class_getInstanceMethod(cls, @selector(canBecomeMainWindow));
        gOrigCanMain = (BoolIMP)method_getImplementation(m3);
        if (!class_addMethod(cls, @selector(canBecomeMainWindow), (IMP)gtw_canBecomeMainWindow, method_getTypeEncoding(m3))) {
            method_setImplementation(m3, (IMP)gtw_canBecomeMainWindow);
        }
    });
}

static void adopt_alert_class(NSWindow *win) {
    swizzle_once([win class]);
    objc_setAssociatedObject(win, kGTWAlertFlagKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static void drop_alert_class(NSWindow *win) {
    objc_setAssociatedObject(win, kGTWAlertFlagKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static NSView *find_webview(NSView *v) {
    if ([v isKindOfClass:[WKWebView class]]) return v;
    for (NSView *sub in v.subviews) {
        NSView *r = find_webview(sub);
        if (r) return r;
    }
    return nil;
}

char *gtw_screens_json(void) {
    __block NSMutableArray *out = [NSMutableArray array];
    run_on_main(^{
        NSArray<NSScreen *> *screens = [NSScreen screens];
        for (NSUInteger i = 0; i < screens.count; i++) {
            NSScreen *s = screens[i];
            NSRect f = s.frame;
            [out addObject:@{
                @"index": @(i),
                @"x": @(f.origin.x), @"y": @(f.origin.y),
                @"width": @(f.size.width), @"height": @(f.size.height),
                @"scale": @(s.backingScaleFactor),
                @"name": nz(s.localizedName),
            }];
        }
    });
    return dup_json(out);
}

// Turn an Electrobun-created NSWindow into a screen-covering alert on the given NSScreen index.
void gtw_window_make_alert(void *windowPtr, int screenIndex) {
    NSWindow *win = (__bridge NSWindow *)windowPtr;
    run_on_main(^{
        NSArray<NSScreen *> *screens = [NSScreen screens];
        NSScreen *screen = (screenIndex >= 0 && (NSUInteger)screenIndex < screens.count) ? screens[screenIndex] : [NSScreen mainScreen];

        adopt_alert_class(win);
        win.titleVisibility = NSWindowTitleHidden;
        win.titlebarAppearsTransparent = YES;
        win.movable = NO;
        win.hasShadow = NO;
        win.hidesOnDeactivate = NO;
        win.animationBehavior = NSWindowAnimationBehaviorNone;
        [win standardWindowButton:NSWindowCloseButton].hidden = YES;
        [win standardWindowButton:NSWindowMiniaturizeButton].hidden = YES;
        [win standardWindowButton:NSWindowZoomButton].hidden = YES;
        win.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces
                               | NSWindowCollectionBehaviorFullScreenAuxiliary
                               | NSWindowCollectionBehaviorStationary
                               | NSWindowCollectionBehaviorIgnoresCycle;
        [win setFrame:screen.frame display:YES];
        [win setLevel:NSScreenSaverWindowLevel];
        [win makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        NSView *wv = find_webview(win.contentView);
        if (wv) [win makeFirstResponder:wv];
    });
}

void gtw_window_make_normal(void *windowPtr) {
    NSWindow *win = (__bridge NSWindow *)windowPtr;
    run_on_main(^{
        drop_alert_class(win);
        [win setLevel:NSNormalWindowLevel];
        win.collectionBehavior = NSWindowCollectionBehaviorDefault;
    });
}

void gtw_window_focus(void *windowPtr) {
    NSWindow *win = (__bridge NSWindow *)windowPtr;
    run_on_main(^{
        [win makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        NSView *wv = find_webview(win.contentView);
        if (wv) [win makeFirstResponder:wv];
    });
}

char *gtw_window_debug_json(void *windowPtr) {
    NSWindow *win = (__bridge NSWindow *)windowPtr;
    __block NSDictionary *d = nil;
    run_on_main(^{
        NSRect f = win.frame;
        d = @{
            @"level": @(win.level),
            @"x": @(f.origin.x), @"y": @(f.origin.y), @"width": @(f.size.width), @"height": @(f.size.height),
            @"visible": @(win.isVisible),
            @"key": @(win.isKeyWindow),
            @"screen": nz(win.screen.localizedName),
            @"collectionBehavior": @(win.collectionBehavior),
            @"styleMask": @(win.styleMask),
            @"firstResponder": nz(NSStringFromClass([win.firstResponder class])),
            @"class": nz(NSStringFromClass([win class])),
            @"alertFlag": @(gtw_is_alert(win)),
        };
    });
    return dup_json(d);
}

void gtw_app_activate(void) {
    run_on_main(^{ [NSApp activateIgnoringOtherApps:YES]; });
}

// Open System Settings at the Calendars privacy pane.
void gtw_open_calendar_privacy_settings(void) {
    run_on_main(^{
        [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"]];
    });
}

} // extern "C"
