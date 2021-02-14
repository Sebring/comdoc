module.exports = {
	env: {
		node: true,
		browser: true,
		es2021: true,
	},
	parserOptions: {
		sourceType: "module"
	},
	extends: "eslint:recommended",
	rules: {
		"brace-style": ["error", "1tbs"],
		"eol-last": ["error", "always"],
		"indent": ["error", "tab"],
		"prefer-const": ["warn"],
		"semi": ["error", "never"],
		"object-shorthand": "warn",
		"no-unused-vars": ["warn", { vars: "all", args: "after-used" }],
		"no-trailing-spaces": ["error", { "ignoreComments": true} ],
		"no-multiple-empty-lines": ["error", { "max": 1 }],
		"keyword-spacing": ["error", { "before": true, "after": true}],
		"arrow-spacing": ["error", { "before": true, "after": true}],
		"comma-spacing": ["error", { "before": false, "after": true}],
		"key-spacing": ["error", { "beforeColon": false, "afterColon": true }],
		"space-before-function-paren": ["error", "never"],
		"space-before-blocks": ["error", "always"]
	},
	overrides: [
		{
			files: [".marko"]
		}
	]
}
