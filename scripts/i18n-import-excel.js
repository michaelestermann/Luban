#!/bin/env node

const path = require('path');
const fs = require('fs');
const winston = require('winston');
const ExcelJS = require('exceljs');

function getLogger() {
    const { combine, colorize, timestamp, printf } = winston.format;
    return winston.createLogger({
        transports: new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp(),
                printf(log => `${log.timestamp} - ${log.level} ${log.message}`)
            ),
            handleExceptions: true
        })
    });
}


const logger = getLogger();
const I18N_DIR = path.resolve(__dirname, '../src/app/resources/i18n');


function getInputFile() {
    if (process.argv.length !== 3) {
        process.abort();
    }
    return process.argv[2];
}

function fillIn(translations, lang) {
    const i18nFile = path.resolve(I18N_DIR, lang, 'resource.json');

    const t = JSON.parse(fs.readFileSync(i18nFile, 'utf-8'));

    Object.keys(translations).forEach((key) => {
        const value = translations[key];

        if (t[key] !== undefined) {
            if (t[key] !== value) {
                if (t[key] !== '') {
                    logger.info(`Change [${key}], [${t[key]}] -> [${value}]`);
                }
                t[key] = value;
            }
        }
    });

    fs.writeFile(i18nFile, JSON.stringify(t, null, 4), () => {});
}

// text of a cell, undefined when it is empty
function cellText(worksheet, address) {
    const value = worksheet.getCell(address).text;
    return value === '' ? undefined : value;
}

async function main() {
    const inputFile = getInputFile();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputFile);
    const worksheet = workbook.worksheets[0];

    const col2lang = {
        B: ['German', 'de'],
        C: ['English', 'en'],
        D: ['Spanish', 'es'],
        E: ['French', 'fr'],
        F: ['Italian', 'it'],
        G: ['Japanese', 'ja'],
        H: ['Korean', 'ko'],
        I: ['Russian', 'ru'],
        J: ['Ukrainian', 'uk'],
        K: ['Chinese', 'zh-CN']
    };

    Object.keys(col2lang).forEach((col) => {
        const item = col2lang[col];

        const cellTitle = cellText(worksheet, `${col}1`);
        if (cellTitle !== item[1]) {
            logger.error(':(');
            return;
        }

        logger.info(`importing ${item[1]} to ${item[1]}`);

        const translations = {};
        for (let i = 2; ; i++) {
            const cell = cellText(worksheet, `A${i}`);
            if (cell === undefined) {
                break;
            }
            const key = cell.trim();
            const value = cellText(worksheet, col + i);
            if (value === undefined) {
                logger.error(`missing col ${col + i}`);
            } else {
                translations[key] = value.trim();
            }
        }

        fillIn(translations, item[1]);
    });
    console.log(cellText(worksheet, 'B1'));
}

main()
    .then(() => logger.info('Done.'))
    .catch((err) => {
        logger.error(err.message);
        process.exitCode = 1;
    });

// node scripts/i18n-import-excel.js {excel}
