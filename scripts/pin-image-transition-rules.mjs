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
    `             (count <= ${index} || isLegacyPinImage(urls[${index}], prefix, prefixLength))`);
  return finalRules.replace(strict + '\n    }', `let urls = data.get('imageUrls', []);
      return urls is list && (urls.size() == 0 || hasLegacyPinImages(urls, data.userId));
    }

    function hasLegacyPinImages(urls, uid) {
      let count = urls.size();
      let prefix = 'https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/pins%2F' + uid + '%2F';
      let prefixLength = prefix.size();
      return count <= ${maxImages} && uid.matches('[^%/?#]+') &&
${checks.join(' &&\n')};
    }

    // Accept the published timestamp-only filename and the later UUID variant.
    function isLegacyPinImage(url, prefix, prefixLength) {
      return url is string && url.size() < 1024 &&
             url[0:prefixLength] == prefix &&
             url[prefixLength:].matches('[0-9]+_([0-9a-f-]{36}_)?[A-Za-z0-9._]*[?]alt=media&token=[0-9a-f-]{36}');
    }`);
}

export function makePinImageTransitionStorageRules(finalRules) {
  const legacy = 'match /pins/{userId}/{fileName} {\n      allow get: if true;';
  if (finalRules.split(legacy).length !== 2) {
    throw new Error('Expected exactly one read-only legacy pin Storage match.');
  }
  return finalRules.replace(legacy, legacy + '\n      allow create: if isOwner(userId) && isValidImage() &&\n                    fileName.matches(\'[0-9]+_([0-9a-f-]{36}_)?[A-Za-z0-9._]*\');');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!['firestore', 'storage'].includes(target)) throw new Error('Use the firestore or storage target.');
  const rules = readFileSync(target + '.rules', 'utf8').replaceAll('\r\n', '\n');
  process.stdout.write(target === 'firestore' ? makePinImageTransitionRules(rules) : makePinImageTransitionStorageRules(rules));
}
