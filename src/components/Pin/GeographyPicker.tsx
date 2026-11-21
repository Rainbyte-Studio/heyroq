import { useId, useMemo, useState } from 'react';
import catalog from '../../../functions/geographyCatalog.json';

export interface GeographySelection {
  countryCode: string;
  cityId: string;
}

const countries = [...catalog.countries].sort((a, b) => a[1].localeCompare(b[1]));
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function GeographyPicker({ selection, onChange, onCenter, disabled }: {
  selection: GeographySelection;
  onChange: (selection: GeographySelection) => void;
  onCenter: (latitude: number, longitude: number) => void;
  disabled: boolean;
}) {
  const fieldId = useId();
  const [query, setQuery] = useState('');
  const countryCities = useMemo(() => catalog.cities.filter(city => city[1] === selection.countryCode)
    .sort((a, b) => String(a[2]).localeCompare(String(b[2]))), [selection.countryCode]);
  const selectedCity = countryCities.find(city => city[0] === selection.cityId);
  const filter = normalize(query.trim());
  const matches = countryCities.filter(city => normalize(String(city[2])).includes(filter));
  const options = matches.slice(0, 100);
  if (selectedCity && !options.includes(selectedCity)) options.unshift(selectedCity);

  return (
    <fieldset disabled={disabled} className="space-y-2 text-xs">
      <legend className="font-bold">Country and city (optional)</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor={fieldId + '-country'}>Country</label>
          <select id={fieldId + '-country'} className="liquid-glass-input block w-full p-2 rounded-xl" value={selection.countryCode}
            onChange={event => {
              setQuery('');
              onChange({ countryCode: event.target.value, cityId: '' });
            }}>
            <option value="">Choose a country</option>
            {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fieldId + '-filter'}>Filter cities</label>
          <input id={fieldId + '-filter'} className="liquid-glass-input block w-full p-2 rounded-xl" value={query}
            disabled={!selection.countryCode} onChange={event => setQuery(event.target.value)} />
        </div>
        <div>
          <label htmlFor={fieldId + '-city'}>City</label>
          <select id={fieldId + '-city'} className="liquid-glass-input block w-full p-2 rounded-xl" value={selection.cityId}
            disabled={!selection.countryCode}
            onChange={event => onChange({ ...selection, cityId: event.target.value })}>
            <option value="">{matches.length ? 'Choose a city' : 'No matching cities'}</option>
            {options.map(([id, , name, region]) =>
              <option key={id} value={id}>{region ? name + ' · ' + region : name}</option>)}
          </select>
        </div>
      </div>
      {matches.length > 100 && <p>Filter by city name to see more matches.</p>}
      {selectedCity && (
        <button type="button" className="text-[var(--heyroq-accent-text)] underline"
          onClick={() => onCenter(Number(selectedCity[4]), Number(selectedCity[5]))}>
          Move pin to city center
        </button>
      )}
      <p>Geography rewards are paused. City data from <a className="underline" href="https://www.geonames.org/export/"
        target="_blank" rel="noreferrer">GeoNames</a> under <a className="underline"
        href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>
    </fieldset>
  );
}
