import { readFileSync, writeFileSync } from 'node:fs';

const [citiesPath, countriesPath, regionsPath] = process.argv.slice(2);
if (!citiesPath || !countriesPath || !regionsPath) {
  throw new Error('Pass extracted cities15000.txt, countryInfo.txt and admin1CodesASCII.txt');
}

const rows = path => readFileSync(path, 'utf8').split(/\r?\n/)
  .filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));
const countryNames = new Map(rows(countriesPath).map(row => [row[0], row[4]]));
const regionNames = new Map(rows(regionsPath).map(row => [row[0], row[1]]));
const cities = rows(citiesPath)
  .filter(row => row[6] === 'P' && !['PPLX', 'PPLH', 'PPLQ', 'PPLW'].includes(row[7]) &&
    /^[A-Z]{2}$/.test(row[8]) && countryNames.has(row[8]))
  .map(row => [row[0], row[8], row[1], regionNames.get(row[8] + '.' + row[10]) ?? '', +row[4], +row[5]])
  .sort((a, b) => +a[0] - +b[0]);
const countries = [...new Set(cities.map(city => city[1]))].sort()
  .map(code => [code, countryNames.get(code)]);
writeFileSync(new URL('../functions/geographyCatalog.json', import.meta.url),
  JSON.stringify({ version: 'geonames-2026-11-21', countries, cities }) + '\n');
