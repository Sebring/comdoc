"use strict"

const fs = require('fs')
const yargs = require('yargs/yargs')(process.argv.slice(2))
const highlight = require('highlight.js')
const marked = require('marked')
const ejs = require('ejs')
const { rcFile } = require('rc-config-loader')

const options = yargs
	.usage('Usage: comdoc [files]')
	.example('comdoc [files]', 'Document all files')
	.help('h').alias('help', 'h')
	.version().alias('version', 'v')
	.parse()

const getConf = readConfig('comdoc')

// FIXME: this is bad - should be config
const NO_PART = 0, JS_PART = 1, HTML_PART = 2, CSS_PART = 3
const commentSymbol = '//'
const commentSectionSymbol = '///'
const language = ['none', 'javascript', 'xml', 'less'] 

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
	pipeThen(getLinesFromFile, getPartsFromLines, getSectionsFromParts, parseSectionsToHtml, runTemplate)(file).then(html => {
		fs.writeFileSync('doc2.html', html)
	})
}

/**
 * (file) => lines[]
 * @param {string} file input file
 */
function getLinesFromFile(file) {
	return fs.readFileSync(file, 'utf-8').split('\n')
}

/**
 * Step 1.
 * Identify the three parts of code.
 * @param {string[]} lines lines to parse into parts
 */
function getPartsFromLines(lines) {

	// common line matching
	let lineIsEmpty = lineTester(/^\r/)
	let testJsBegin = lineTester(/(^import\s)|(^class\s{)/)
	let testCssBegin = lineTester(/^style/)
	let testCommentBegin = lineTester(`^\\s*${commentSymbol}\\s?`)
	let testJsComplete =  lineTester(/^}/)
	let testCssComplete = lineTester(/^}/)
	let testHtmlComplete = function (line) { 
		return testCssBegin(line) || testJsBegin(line)
	}
	var addEmptyLine = (state, line) => state && lineIsEmpty(line)

	return parseLines(lines)

	// recursive parser  
	// * lines - remaining lines
	// * buff - will hold the 3 parts\
	// * part - current part
	// * count - line counter
	function parseLines(lines, buff = [[],[],[],[]], part = NO_PART, count = 1) {
		if (!lines[0]) return buff.slice(1)
		if (count > 1500) return

		let line = lines[0]

		let isPart = equals(part)

		//console.log(count, lines[0], part)

		// we have no part at this point
		// identify new part and continue
		if (isPart(NO_PART)) {
			if (lineIsEmpty(line) || testCommentBegin(line))
				part = part
			else if (testJsBegin(line)) {
				part = JS_PART
				buff[part] = buff[NO_PART].length ? [...buff[NO_PART]] : []
				buff[NO_PART] = []
			} else if (testCssBegin(line)) {
				part = CSS_PART
				buff[part] = buff[NO_PART].length ? [...buff[NO_PART]] : []
				buff[NO_PART] = []
			} else {
				part = HTML_PART
				buff[part] = buff[NO_PART].length ? [...buff[NO_PART]] : []
				buff[NO_PART] = []
			}
			//console.log('part begins: ' + language[part], count)
			buff[part].push(line)
			return parseLines(lines.slice(1), buff, part, ++count)
		}

		// current js- or css part might complete
		if (isPart(JS_PART) && testJsComplete(line) ||
			(isPart(CSS_PART) && testCssComplete(line))) {
			buff[part].push(line)
			//console.log('js/css completed', count, line)
			return parseLines(lines.slice(1), buff, NO_PART, ++count)
		}

		// as html completes if another part begins, pass counter and line
		// as is to next
		if (isPart(HTML_PART) && testHtmlComplete(line)) {
			//console.log('html completed', count, line)
			return parseLines(lines, buff, NO_PART, count)
		}

		// add current line to ongoing part
		buff[part].push(line)
		//console.log('add line', count)
		return parseLines(lines.slice(1), buff, part, ++count)
	}
}

/**
 * Step 2 - break parts into sections of code/docs with language.
 * @param {parts[]} parts array of parts
 */
function getSectionsFromParts(parts) {
	// console.log('parts', parts)
	let sections = parts.flatMap((part, index) => parsePartToSections(part, language[1+index]))
	return sections
}

function parsePartToSections(part, lang) {
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

	return parseLine(part)

	function parseLine(lines) {
		if(!lines[0]) {
			//console.log('done with section', code, comments, docs)
			// end ongoing section, code or docs
			if (code.length)
				buff.push({ code: [...code], lang, comments: [...comments] })
			else if (docs.length)
				buff.push({ docs: [...docs], lang })
			docs = []
			code = []
			comments = []
			return buff
		}

		let line = lines[0]

		if (isAComment(line)) {
			//console.log('itsa comment', line)
			// if we started a new doc section we are finsihed with 
			// code section (if any), also add comments to it
			if (code.length) {
				//console.log('pushing code', { code: [...code], lang })
				buff.push({ code: [...code], lang, comments: [...comments]})
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
				buff.push({ docs: [...docs], lang })
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
	return function(line) {
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
