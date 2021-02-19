"use strict"

const fs = require('fs')
const yargs = require('yargs/yargs')(process.argv.slice(2))
const highlight = require('highlight.js')
const marked = require('marked')
const ejs = require('ejs')
const { rcFile } = require('rc-config-loader')
const { extname } = require('path')

const options = yargs
	.usage('Usage: comdoc [files]')
	.example('comdoc [files]', 'Document all files')
	.help('h').alias('help', 'h')
	.version().alias('version', 'v')
	.parse()

const getConf = readConfig('comdoc')
const langConf = rcFile('languages', { configFileName: 'languages.yaml' }).config

// FIXME: this is bad - should be config
const commentSymbol = '//'
const commentSectionSymbol = '///'

// async compose
const composeThen = (...functions) => input => functions.reduceRight((chain, func) => chain.then(func), Promise.resolve(input))
// async pipe
const pipeThen = (...functions) => input => functions.reduce((chain, func) => chain.then(func), Promise.resolve(input))


async function run() {
	console.log(yargs.argv._)
	
	// TODO: sanity check

	// document each file
	documentAll(yargs.argv._) // FIXME - use real arguments
}

/**
 * Document list of files
 * @param {string[]} files array of files
 */
async function documentAll(files) {
	// just loop all files into documentOne
	for (const file of files) await documentOne(file)
}

async function documentOne(file) {
	pipeThen(getLineAndLanguageFromFile, getPartsFromLines, getSectionsFromParts, parseSectionsToHtml, runTemplate)(file).then(html => {
		fs.writeFileSync('doc2.html', html)
	})
}

function getFileExtension(file) {
	return extname(file)
}

function getLanguageForExtension(extension) {
	return langConf.find(language => language.extension === extension)
}

/**
 * (file) => lines[]
 * @param {string} file input file
 */
function getLinesFromFile(file) {
	return fs.readFileSync(file, 'utf-8').split('\n')
}

/**
 * Get object of { lines, language } from file.
 * @param {string} file file
 * @return {object} { lines, language }
 */
function getLineAndLanguageFromFile(file) {
	return {lines: getLinesFromFile(file), language: getLanguageForExtension(getFileExtension(file))}
}

/**
 * Step 1.
 * Identify the three parts of code.
 * @param {string[]} lines lines to parse into parts
 */
function getPartsFromLines(linesAndLanguage) {
	var NO_PART = 0

	let parts = linesAndLanguage.language.parts.map(part => {
		let p = {}
		p.name = part.name
		p.begins = lineTester(part.begin)
		p.ends = lineTester(part.end)
		p.excludeEnd = part.excludeEnd
		p.excludeBegin = part.excludeBegin
		return p
	})

	// common line matching
	let lineIsEmpty = lineTester(/^\r/)
	let testCommentBegin = lineTester(`^\\s*${commentSymbol}\\s?`)

	return parseLines(linesAndLanguage.lines)

	function parseLines(lines, buff = [[]], part = NO_PART, count = 1) {
		if (!lines[0]) { 
			return buff.slice(1)
		}

		let line = lines[0]
		let isPart = equals(part)

		// check if part begins
		if (isPart(NO_PART)) {
			// add empty line or comment to no-part
			if (lineIsEmpty(line) || testCommentBegin(line)) {
				buff[NO_PART].push(line)
				return parseLines(lines.slice(1), buff, part, ++count)
			}
			
			// check line in order of apperance in language file
			for (const p of parts) {
				if (p.begins(line)) {
					part = p.name
					buff[buff.length] = { language: p.name, lines: [...buff[NO_PART], line] }
					buff[NO_PART] = []
					// FIXME - exclude begin
					//console.log(`${p.name} begins at ${count}`)
					return parseLines(lines.slice(1), buff, part, ++count)
				}
			}
		}

		// check if part ends
		// FIXME - #5
		for (const p of parts) {
			if (isPart(p.name)) {
				if (p.ends(line)) {
					//console.log(`${p.name} ends at ${count}`)
					let slize = 0
					if (!p.excludeEnd) {
						buff[buff.length-1].lines.push(line)
						slize = 1
						count++
					}
					return parseLines(lines.slice(slize), buff, NO_PART, count)
				}
			}
		}

		// add to current part
		buff[buff.length-1].lines.push(line)
		return parseLines(lines.slice(1), buff, part, ++count)
	}
}

/**
 * Step 2 - break parts into sections of code/docs with language.
 * @param {parts[]} parts array of parts
 */
function getSectionsFromParts(parts) {
	//console.log('parts', parts)
	let sections = parts.flatMap((part) => parsePartToSections(part))
	return sections
}

function parsePartToSections(part) {
	// common line matchers
	let isComment = lineTester(`^\\s*${commentSymbol}\\s?`)
	let isCommentSection = lineTester(`^\\s*${commentSectionSymbol}\\s?`)
	let ignoreComment = lineTester(/(^#![/]|^\s*#\{)/)
	let isAComment = (line) => isComment(line) && !ignoreComment(line)
	let isACommentSection = (line) => isCommentSection(line)

	let docs = []
	let comments = []
	let code = []
	let buff = []

	return parseLine(part.lines)

	function parseLine(lines) {
		if(!lines[0]) {
			
			// end ongoing section, code or docs
			if (code.length)
				buff.push({ code: [...code], lang: part.language, comments: [...comments] })
			else if (docs.length)
				buff.push({ docs: [...docs], lang: part.language })
			docs = []
			code = []
			comments = []
			//console.log('done with section', buff)
			return buff
		}

		let line = lines[0]

		if (isAComment(line)) {
			//console.log('itsa comment', line)
			// if we started a new doc section we are finsihed with 
			// code section (if any), also add comments to it
			if (code.length) {
				//console.log('pushing code', { code: [...code], lang })
				buff.push({ code: [...code], lang: part.language, comments: [...comments]})
				code = []
				comments = []
			}
			if (isACommentSection(line)) {
				//console.log('itsa comment section', line)
				docs.push(line.replace(/^\s*\/\/\/\s/, '')) // FIXME
			} else {
				// event if it wasn't a comment section, it should go there if one is opened
				if (docs.length) {
					//console.log('itsa part of comment section', line)
					docs.push(line.replace(/^\s*\/\/\s/, '')) // FIXME
				} else {
					//console.log('itsa inline comment', line)
					// ok, so it is an inline comment
					comments.push(line.replace(/^\s*\/\/\s/, '')) // FIXME
					//console.log('itsa inline comment', comments)
				}
			}
		} else {
			//console.log('its code', line)
			// add this line to code
			code.push(line)
			// end current doc section
			if (docs.length) {
				buff.push({ docs: [...docs], lang: part.language })
				docs = []
			}
		}
		return parseLine(lines.slice(1))
	}
}

/**
 * Step 3 - Make html of each sections
 */
function parseSectionsToHtml(sections) {
	const html = sections.map(section => {
		if (section.code) {
			return {
				lang: section.lang,
				codeHtml: highlight.highlight(section.lang, section.code.join('')).value,
				commentsHtml: marked(section.comments.join(' '))
			}
		} else if (section.docs) {
			return {
				lang: section.lang,
				docsHtml: marked(section.docs.join(' '))
			}
		}
	})
	//console.log('parseSectionsToHtml', html)
	return html
}

/**
 * Step 4 Run html through template.
 */
async function runTemplate(sections) {
	const file = fs.readFileSync(getConf('template'))
	const template = await ejs.compile(file.toString())

	// FIXME!!
	let html = await template({title: 'test', sections, css: 'comdoc.css', sources: ['component.marko']})
	return html
}

function finalPath(source) {
	return path.join(
		'docs',
		path.dirname(source),
		path.basename(source, path.extname(source)) + '.' + html
	)
}

function addLanguageComment(language) {
	const lang = Object.assign({}, language)
	lang.commentMatcher = RegExp(`^\\s*${language.symbol}\\s?`)
	lang.commentFilter = /(^#![/]|^\s*#\{)/
	return lang
}

// readConfig :: configFile -> (prop -> value)
function readConfig(name) {
	var rc = rcFile(name)
	return function (prop) {
		return rc.config[prop]
	}
}

// equals :: number -> (number -> boolean)
function equals(x) {
	return function (y) {
		return x === y
	}
}

// linetester :: string -> (string -> string)
function lineTester(regexp) {
	let x = new RegExp(regexp)
	return function testLine(line) {
		return x.test(line)
	}
}

module.exports.run = run
module.exports.documentAll = documentAll
module.exports.documentOne = documentOne
module.exports.getLinesFromFile = getLinesFromFile
module.exports.getPartsFromLines = getPartsFromLines
module.exports.getSectionsFromParts = getSectionsFromParts
module.exports.getLinesFromFile = getLinesFromFile
module.exports.parseSectionsToHtml = parseSectionsToHtml
