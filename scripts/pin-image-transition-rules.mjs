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
    `             (urls.size() <= ${index} || isLegacyPinImage(urls[${index}], data.userId))`);
  const bucket = config.storageBucket.replaceAll('.', '[.]');
  return finalRules.replace(strict + '\n    }', `let urls = data.get('imageUrls', []);
      return urls is list && urls.size() <= ${maxImages} &&
${checks.join(' &&\n')};
    }

    // Transitional guard for URLs emitted by the previous Firebase Storage client.
    function isLegacyPinImage(url, uid) {
      return url is string && url.size() < 1024 &&
             url.matches('https://firebasestorage[.]googleapis[.]com/v0/b/${bucket}/o/pins%2F[^%/?#]+%2F[0-9]+_[0-9a-f-]{36}_[A-Za-z0-9._]*[?]alt=media&token=[0-9a-f-]{36}') &&
             url.split('%2F')[1] == uid;
    }`);
}

export function makePinImageTransitionStorageRules(finalRules) {
  const legacy = 'match /pins/{userId}/{fileName} {\n      allow read: if true;';
  if (finalRules.split(legacy).length !== 2) {
    throw new Error('Expected exactly one read-only legacy pin Storage match.');
  }
  return finalRules.replace(legacy, legacy + '\n      allow create: if resource == null && isOwner(userId) && isValidImage();');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!['firestore', 'storage'].includes(target)) throw new Error('Use the firestore or storage target.');
  const rules = readFileSync(target + '.rules', 'utf8').replaceAll('\r\n', '\n');
  process.stdout.write(target === 'firestore' ? makePinImageTransitionRules(rules) : makePinImageTransitionStorageRules(rules));
}
