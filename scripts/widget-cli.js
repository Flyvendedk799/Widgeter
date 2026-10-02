#!/usr/bin/env node
'use strict';
// Widget authoring helper.
//   widget-cli validate <widget file|folder|dir of widgets>...
//   widget-cli pack <folder> [out.widget]      folder -> single .widget file
//   widget-cli unpack <file.widget> [folder]   single file -> folder
const fs = require('fs');
const path = require('path');
const format = require('../engine/widget-format');

function targets(p) {
  if (format.isFolderWidget(p) || /\.widget$/i.test(p)) return [p];
  return format.listWidgets(p).map((i) => i.path);
}

function validate(paths) {
  let failed = 0;
  let count = 0;
  for (const root of paths) {
    for (const p of targets(root)) {
      count++;
      const r = format.loadWidget(p, { strict: format.isFolderWidget(p) });
      const label = path.relative(process.cwd(), p) || p;
      if (r.ok) console.log('ok    ' + label + (r.warnings.length ? '  (' + r.warnings.join('; ') + ')' : ''));
      else {
        failed++;
        console.log('FAIL  ' + label);
        r.errors.forEach((e) => console.log('        ' + e));
      }
    }
  }
  console.log('\n' + (count - failed) + '/' + count + ' valid');
  return failed ? 1 : 0;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'validate' && rest.length) return validate(rest);
  if (cmd === 'pack' && rest[0]) {
    const out = rest[1] || path.basename(rest[0]) + '.widget';
    fs.writeFileSync(out, JSON.stringify(format.packWidget(rest[0]), null, 2));
    console.log('wrote ' + out);
    return 0;
  }
  if (cmd === 'unpack' && rest[0]) {
    const out = rest[1] || path.basename(rest[0]).replace(/\.widget$/i, '');
    format.unpackWidget(format.packWidget(rest[0]), out);
    console.log('wrote ' + out + '/');
    return 0;
  }
  console.log('usage: widget-cli validate <path>... | pack <folder> [out.widget] | unpack <file.widget> [folder]');
  return 2;
}

process.exit(main(process.argv.slice(2)));
