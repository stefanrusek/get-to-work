// Renders the Get To Work app icon (icon.iconset/*) and the menu bar template glyph (assets/icons/).
// Run: swift scripts/make-icon.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")

func squircle(_ r: CGRect, radius: CGFloat) -> NSBezierPath {
    return NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius)
}

/// Clock glyph with vibration arcs, drawn inside `box`, color `ink`.
func drawGlyph(in box: CGRect, ink: NSColor, face: NSColor?, lineScale: CGFloat = 1) {
    let s = box.width
    let cx = box.midX, cy = box.midY
    let r = s * 0.30
    let clock = CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)

    if let face = face {
        // soft shadow under the face
        NSGraphicsContext.saveGraphicsState()
        let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.35); sh.shadowBlurRadius = s * 0.04; sh.shadowOffset = NSSize(width: 0, height: -s * 0.02)
        sh.set()
        face.setFill(); NSBezierPath(ovalIn: clock).fill()
        NSGraphicsContext.restoreGraphicsState()
    }
    // rim
    ink.setStroke()
    let rim = NSBezierPath(ovalIn: clock.insetBy(dx: s * 0.02, dy: s * 0.02))
    rim.lineWidth = s * 0.045 * lineScale
    rim.stroke()
    // tick marks at 12/3/6/9
    for i in 0..<4 {
        let a = CGFloat(i) * .pi / 2
        let p = NSBezierPath()
        p.move(to: CGPoint(x: cx + cos(a) * r * 0.78, y: cy + sin(a) * r * 0.78))
        p.line(to: CGPoint(x: cx + cos(a) * r * 0.66, y: cy + sin(a) * r * 0.66))
        p.lineWidth = s * 0.035 * lineScale; p.lineCapStyle = .round; p.stroke()
    }
    // hands: minute at 12 (slightly before), hour at ~10 → "one minute to go"
    let hands = NSBezierPath()
    hands.move(to: CGPoint(x: cx, y: cy))
    hands.line(to: CGPoint(x: cx - r * 0.07, y: cy + r * 0.52))
    hands.move(to: CGPoint(x: cx, y: cy))
    hands.line(to: CGPoint(x: cx - r * 0.40, y: cy + r * 0.22))
    hands.lineWidth = s * 0.055 * lineScale; hands.lineCapStyle = .round
    hands.stroke()
    NSBezierPath(ovalIn: CGRect(x: cx - s * 0.035, y: cy - s * 0.035, width: s * 0.07, height: s * 0.07)).fill()
    // vibration arcs left and right
    for side: CGFloat in [-1, 1] {
        for (k, gap) in [0.10, 0.19].enumerated() {
            let arc = NSBezierPath()
            let rad = r + s * CGFloat(gap)
            let start: CGFloat = side < 0 ? 150 : -30
            arc.appendArc(withCenter: CGPoint(x: cx, y: cy), radius: rad, startAngle: start, endAngle: start + 60)
            arc.lineWidth = s * (k == 0 ? 0.05 : 0.04) * lineScale
            arc.lineCapStyle = .round
            arc.stroke()
        }
    }
}

func renderAppIcon(size: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    let s = CGFloat(size)
    let full = CGRect(x: 0, y: 0, width: s, height: s)
    // macOS icons leave ~10% transparent margin around the squircle
    let inset = s * 0.09
    let plate = full.insetBy(dx: inset, dy: inset)
    let path = squircle(plate, radius: plate.width * 0.225)

    NSGraphicsContext.saveGraphicsState()
    let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.30); sh.shadowBlurRadius = s * 0.03; sh.shadowOffset = NSSize(width: 0, height: -s * 0.012)
    sh.set()
    NSColor(calibratedRed: 0.11, green: 0.10, blue: 0.22, alpha: 1).setFill(); path.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    path.addClip()
    let grad = NSGradient(colorsAndLocations:
        (NSColor(calibratedRed: 0.13, green: 0.09, blue: 0.36, alpha: 1), 0.0),
        (NSColor(calibratedRed: 0.62, green: 0.10, blue: 0.55, alpha: 1), 0.55),
        (NSColor(calibratedRed: 1.00, green: 0.36, blue: 0.20, alpha: 1), 1.0))!
    grad.draw(in: plate, angle: 60)
    // glossy highlight
    let hi = NSGradient(starting: NSColor.white.withAlphaComponent(0), ending: NSColor.white.withAlphaComponent(0.22))!
    hi.draw(in: CGRect(x: plate.minX, y: plate.midY, width: plate.width, height: plate.height / 2), angle: 90)
    NSGraphicsContext.restoreGraphicsState()

    drawGlyph(in: plate, ink: NSColor(calibratedRed: 0.10, green: 0.08, blue: 0.24, alpha: 1), face: NSColor.white)
    img.unlockFocus()
    return img
}

func renderTemplate(size: Int) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    let s = CGFloat(size)
    NSColor.black.setFill(); NSColor.black.setStroke()
    drawGlyph(in: CGRect(x: 0, y: 0, width: s, height: s).insetBy(dx: s * 0.02, dy: s * 0.02), ink: .black, face: nil, lineScale: 1.35)
    img.unlockFocus()
    return img
}

func writePNG(_ img: NSImage, pixels: Int, to url: URL) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: pixels, height: pixels)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    img.draw(in: CGRect(x: 0, y: 0, width: pixels, height: pixels), from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
}

let iconset = root.appendingPathComponent("icon.iconset")
try? FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let px = base * scale
        let name = scale == 1 ? "icon_\(base)x\(base).png" : "icon_\(base)x\(base)@2x.png"
        writePNG(renderAppIcon(size: px), pixels: px, to: iconset.appendingPathComponent(name))
    }
}
writePNG(renderAppIcon(size: 1024), pixels: 1024, to: root.appendingPathComponent("assets/icons/app-1024.png"))
let menubar = root.appendingPathComponent("assets/icons")
writePNG(renderTemplate(size: 18), pixels: 18, to: menubar.appendingPathComponent("menubarTemplate.png"))
writePNG(renderTemplate(size: 36), pixels: 36, to: menubar.appendingPathComponent("menubarTemplate@2x.png"))
print("wrote icon.iconset (10 files), assets/icons/app-1024.png, assets/icons/menubarTemplate{,@2x}.png")
