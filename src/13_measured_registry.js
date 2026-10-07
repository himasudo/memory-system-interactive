/* Results shipped with the site, if any. Pure validation; they never change the simulations. */
var MeasuredRegistry = (function () {
  'use strict';
  function object(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function require(ok, message) {
    if (!ok) throw new Error(message);
  }
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (object(v))
      return (
        '{' +
        Object.keys(v)
          .sort()
          .map(function (k) {
            return JSON.stringify(k) + ':' + canonical(v[k]);
          })
          .join(',') +
        '}'
      );
    return JSON.stringify(v);
  }
  function validate(registry) {
    require(object(registry) &&
      registry.schema ===
        'memory-lab-measured-machines-v1', 'Unsupported measured-machine registry.');
    require(Array.isArray(registry.machines) &&
      registry.machines.length <= 8, 'Registry requires at most eight optional machines.');
    var ids = new Set(),
      files = new Set();
    registry.machines.forEach(function (e) {
      require(object(e) &&
        typeof e.id === 'string' &&
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id) &&
        !ids.has(e.id), 'Invalid or duplicate measured-machine ID.');
      ids.add(e.id);
      require(typeof e.label === 'string' &&
        e.label.length > 0 &&
        e.label.length <= 160, 'Measured machine needs a short display label.');
      require(typeof e.file === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*\.json$/.test(e.file) &&
        e.file !== 'index.json' &&
        !files.has(e.file), 'Dataset file must be a unique JSON basename, never a URL or path.');
      files.add(e.file);
      require(object(e.identity) &&
        typeof e.identity.cpu_model === 'string' &&
        e.identity.cpu_model.length > 0 &&
        typeof e.identity.architecture === 'string' &&
        e.identity.architecture.length > 0 &&
        object(e.identity.cpu_details), 'Expected recorded CPU identity is required.');
      require(Object.values(e.identity.cpu_details).every(function (v) {
        return typeof v === 'string' || typeof v === 'number';
      }), 'Expected CPU details must contain scalar recorded fields.');
    });
    return registry;
  }
  function matches(entry, machine) {
    return (
      object(machine) &&
      machine.cpu_model === entry.identity.cpu_model &&
      machine.architecture === entry.identity.architecture &&
      canonical(machine.cpu_details) === canonical(entry.identity.cpu_details)
    );
  }
  return { validate: validate, matches: matches };
})();
if (typeof module !== 'undefined') module.exports = MeasuredRegistry;
