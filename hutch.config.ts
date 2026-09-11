// @hutch cli=0.27.0-canary.2 cottontail=0.7.0-canary.2
export default {
	packageManager: "bun",
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: ["hutch", "electrobun", "dev"],
		dev: ["hutch", "electrobun", "dev", "--watch"],
		build: ["hutch", "electrobun", "build", "--env=stable"],
		test: ["bun", "test"],
		"build:native": ["bash", "scripts/build-native.sh"],
		release: ["bun", "scripts/package-installer.ts"],
	},
	electrobun: {
		version: "2.0.2-beta.19",
	},
};
