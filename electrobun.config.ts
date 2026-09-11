import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Get To Work",
		identifier: "ai.sugarmaple.get-to-work",
		version: "0.1.0",
		description: "Unmissable full-screen meeting alerts on every display",
	},
	runtime: {
		exitOnLastWindowClosed: false,
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		views: {
			alert: {
				entrypoint: "src/views/alert/index.ts",
			},
			settings: {
				entrypoint: "src/views/settings/index.ts",
			},
		},
		copy: {
			"src/views/alert/index.html": "views/alert/index.html",
			"src/views/alert/index.css": "views/alert/index.css",
			"src/views/settings/index.html": "views/settings/index.html",
			"src/views/settings/index.css": "views/settings/index.css",
			"build/native/libgtw.dylib": "native/libgtw.dylib",
			"assets/icons/menubarTemplate.png": "views/icons/menubarTemplate.png",
			"assets/icons/menubarTemplate@2x.png": "views/icons/menubarTemplate@2x.png",
		},
		mac: {
			icons: "icon.iconset",
			bundleCEF: false,
			codesign: false,
			createDmg: false,
		},
	},
	scripts: {
		preBuild: "scripts/build-native.ts",
		postBuild: "scripts/post-build.ts",
		postWrap: "scripts/post-build.ts",
	},
} satisfies ElectrobunConfig;
