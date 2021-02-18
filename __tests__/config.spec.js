const { rcFile } = require('rc-config-loader')

var conf = null

describe('Config', () => {
	it('exists', () => {
		conf = rcFile('comdoc')
		expect(conf).toBeDefined()
		expect(conf.config).toBeDefined()
		expect(conf.filePath).toBeDefined()
	})

	it('has default template', () => {
		expect(conf.config.template).toBeDefined()
	})

	it('has default output dir', () => {
		expect(conf.config.outputDir).toBeDefined()
	})
})