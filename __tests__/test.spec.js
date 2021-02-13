const Comdoc = require('../comdoc.js')

	let lines = null
	let parts = null
	let sections = null

describe('Comdoc', () => {
	describe('general parsing', () => {
	
		test('get lines from file', () => {
			lines = Comdoc.getLinesFromFile('./__tests__/test1.marko')
			expect(lines).toBeDefined()
		})

		test('get parts from lines', async (done) => {
			try {
				parts = await Comdoc.getPartsFromLines(lines)
				expect(parts).toBeDefined()
				done()
			} catch (e) {
				done(e)
			}
		})

		test('get sections from parts', async (done) => {
			try {
				sections = Comdoc.getSectionsFromParts(parts)
				expect(sections).toBeDefined()
				done()
			} catch (e) {
				done(e)
			}
		})
	})

	describe('test1.marko', () => {
		it('should have 21 lines', () => {
				expect(lines.length).toBe(21)
		})

		it('should contain 3 parts', () => {
			expect(parts.length).toBe(3)
		})

		it('should have 3 sections', () => {
			expect(sections.length).toBe(3)
		})
	})
})