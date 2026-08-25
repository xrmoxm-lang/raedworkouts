const modules = [
  '../domain/catalogue.js',
  '../domain/events.js',
  '../domain/volume.js',
  '../domain/progression.js',
  '../domain/clamps.js',
  '../domain/migrations.js',
  '../domain/substitutions.js',
];

for (const modulePath of modules) await import(modulePath);
console.log('PHASE1_MODULES_IMPORTABLE');
