const Comdoc = require('../comdoc.js')
const FPO = require('fpo')

	let lines = null
	let parts = null
	let sections = null

describe('Comdoc', () => {
	describe('general parsing', () => {
	
		test('get lines from file', () => {
			lines = Comdoc.getLinesFromFile('./__tests__/test1.marko')
			expect(lines).toBeDefined()
		})

		test('get parts from lines', () => {
			parts = Comdoc.getPartsFromLines(lines)
			expect(parts).toBeDefined()
		})

		test('get sections from parts', () => {
			sections = Comdoc.getSectionsFromParts(parts)
			expect(sections).toBeDefined()
		})
	})

	describe('test1.marko', () => {
		it('has 22 lines', () => {
			expect(lines.length).toBe(22)
		})
		
		it('contains 3 parts', () => {
			expect(parts.length).toBe(3)
		})
		it('has sections', () => {
			//console.log(sections)
			expect(sections.length).toBe(4)
			expect(sections[1].comments[0].length).toBeGreaterThan(5)
			expect(sections[2].comments[0]).toBeUndefined()
			
		})
		describe('parts', () => {
			testSectionsComments([[0,36], [1,15] , [2, 0]])
		})

		describe('sections', () => {
			let langTest = [
				[0, 'javascript'],
				[1, 'javascript'],
				[2, 'xml'],
				[3, 'less']
			]
			testSectionsLang(langTest)
		})
	})

	function testSectionsLang(list) { 
		test.each(list)('expect section %i to be lang %s', (index, lang) => {
			expect(sections[index].lang).toBe(lang)
		})
	}

	function testSectionsComments(list) {
		test.each(list)('expect section %i to have comment of length %i', (index, commentLength) => {
			commentLength && expect(sections[index].comments[0].length).toBe(commentLength)
			commentLength || expect(sections[index].comments[0]).toBeUndefined()
		})
	}
})