import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import config from '../firebase-applet-config.json' with { type: 'json' };

export function makePinImageTransitionRules(finalRules) {
  const strict = "return data.get('imageUrls', []) == [];";
  if (finalRules.split(strict).length !== 2) {
    throw new Error('Expected exactly one strict pin image guard.');
  }
  const maxImages = 20;
  const checks = Array.from({ length: maxImages }, (_, index) =>
    `             (count <= ${index} || urls[${index}].size() < 1024)`);
  const bucket = config.storageBucket.replaceAll('.', '[.]');
  const backslashPattern = JSON.stringify(String.raw`[\\]`);
  const quotedBackslash = JSON.stringify(String.raw`\E\\\Q`);
  const quoteStart = JSON.stringify(String.raw`\Q`);
  const quoteEnd = JSON.stringify(String.raw`\E`);
  return finalRules.replace(strict + '\n    }', `let urls = data.get('imageUrls', []);
      return urls is list && (urls.size() == 0 || hasLegacyPinImages(urls, data.userId));
    }

    function hasLegacyPinImages(urls, uid) {
      let count = urls.size();
      // Quote the UID as a regex literal, including any embedded backslashes.
      let owner = ${quoteStart} + uid.split(${backslashPattern}).join(${quotedBackslash}) + ${quoteEnd};
      let pattern = 'https://firebasestorage[.]googleapis[.]com/v0/b/${bucket}/o/pins%2F' + owner +
                    '%2F[0-9]+_([0-9a-f-]{36}_)?[A-Za-z0-9._]*[?]alt=media&token=[0-9a-f-]{36}';
      return count <= ${maxImages} && uid.matches('[^%/?#]+') &&
             matchesLegacyPinImageList(urls, pattern) &&
${checks.join(' &&\n')};
    }

    function matchesLegacyPinImageList(urls, pattern) {
      let joined = urls.join('#');
      // Round-tripping rejects embedded separators and non-string elements.
      return joined.split('#') == urls && joined.matches(pattern + '(#' + pattern + ')*');
    }`);
}

export function makePinImageTransitionStorageRules(finalRules) {
  const legacy = "match /pins/{userId}/{fileName} {\n      allow get: if resource.metadata.get('heyroqRestricted', '') != '1';";
  if (finalRules.split(legacy).length !== 2) {
    throw new Error('Expected exactly one read-only legacy pin Storage match.');
  }
  return finalRules.replace(legacy, legacy + '\n      allow create: if resource == null && isOwner(userId) && isValidImage() &&\n                    fileName.matches(\'[0-9]+_([0-9a-f-]{36}_)?[A-Za-z0-9._]*\');');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!['firestore', 'storage'].includes(target)) throw new Error('Use the firestore or storage target.');
  const rules = readFileSync(target + '.rules', 'utf8').replaceAll('\r\n', '\n');
  process.stdout.write(target === 'firestore' ? makePinImageTransitionRules(rules) : makePinImageTransitionStorageRules(rules));
}
