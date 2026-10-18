// Hand-authored vector exploration. Prior raster/native exports stay intact.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const directory = fileURLToPath(new URL('../assets/branding/', import.meta.url));
const silhouette = `M570 1038
C337 1038 163 866 163 636
C163 385 358 193 609 193
C864 193 1053 367 1053 595
C1053 797 943 889 779 889
L718 889 Q700 889 700 871 L700 835
C661 877 613 900 555 900
C433 900 356 793 356 657
C356 503 447 398 565 398
C621 398 670 423 700 466
L700 435 Q700 417 718 417
L777 417 Q795 417 795 435 L795 779
C890 779 947 713 947 597
C947 413 802 302 610 302
C417 302 273 443 273 636
C273 816 402 934 582 934
L608 934 Q624 934 617 949
L582 1029 Q578 1038 570 1038 Z
M700 564
C671 530 632 507 577 507
C510 507 464 567 464 656
C464 742 510 798 577 798
C625 798 667 781 700 749 Z`;
const outer = 'M570 987 C365 990 218 837 218 636 C218 413 400 248 609 248 C833 248 1000 410 1000 595 C1000 764 910 834 748 834 L748 445';
const inner = 'M748 650 C748 546 679 455 577 455 C479 455 410 541 410 657 C410 766 470 848 565 848 C661 848 748 759 748 650';
const defs = `<clipPath id="mark"><path d="${silhouette}" clip-rule="evenodd"/></clipPath>`;
const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254">${content}</svg>\n`;
fs.writeFileSync(directory+'tech-at-periwinkle-v6.svg', svg(`<title>Tech @ in periwinkle</title><rect width="1254" height="1254" fill="white"/><path d="${silhouette}" fill="#8587c9" fill-rule="evenodd"/>`));
for (const [name, route, width] of [['outer',outer,180],['inner',inner,160]]) {
  fs.writeFileSync(directory+`tech-at-loading-${name}-v6-mask.svg`, svg(`<defs>${defs}<filter id="soft" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="12"/></filter></defs><g clip-path="url(#mark)"><path d="${route}" fill="none" stroke="white" stroke-width="${width}" stroke-linecap="round" filter="url(#soft)"/></g>`));
}

// The adjacent HTML preview is an archived snapshot of the rejected trial,
// captured while v6 was active. It does not follow the restored runtime CSS.
console.log('Built archived v6 periwinkle mark and two vector masks.');
