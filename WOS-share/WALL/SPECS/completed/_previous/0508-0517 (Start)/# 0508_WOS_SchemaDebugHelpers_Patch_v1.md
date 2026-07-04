# 0508_WOS_SchemaDebugHelpers_Patch_v1.0.1

## Goal

Add `_wos.debugSchemas()` and `_wos.validateSchemas()` helpers so the newly added `SBE.Schemas` layer can be inspected from DevTools.

## Files To Touch

- `wall/main.js`

Do not touch any other file.

## Required Patch

Inside `main.js`, after `window._wos` has been created, add these methods to the `_wos` object:

```js
debugSchemas: function debugSchemas() {
  return window.SBE && window.SBE.Schemas ? window.SBE.Schemas : null;
},

validateSchemas: function validateSchemas() {
  var schemas = window.SBE && window.SBE.Schemas;
  var registry = window.SBE && window.SBE.Registry;
  var errors = [];
  var warnings = [];

  if (!schemas) {
    errors.push("SBE.Schemas is missing");
    return { errors: errors, warnings: warnings };
  }

  function checkField(schemaName, fieldName, descriptor) {
    if (!descriptor || typeof descriptor !== "object") {
      errors.push(schemaName + "." + fieldName + " is not a field descriptor");
      return;
    }

    if (typeof descriptor.persistent !== "boolean") {
      warnings.push(schemaName + "." + fieldName + " missing persistent boolean");
    }

    if (typeof descriptor.runtime !== "boolean") {
      warnings.push(schemaName + "." + fieldName + " missing runtime boolean");
    }

    if (descriptor.persistent === true && descriptor.runtime === true) {
      errors.push(schemaName + "." + fieldName + " cannot be both persistent and runtime");
    }
  }

  function walkSchema(schemaName, schema) {
    if (!schema || typeof schema !== "object") {
      errors.push(schemaName + " is not an object");
      return;
    }

    Object.keys(schema).forEach(function (key) {
      var value = schema[key];

      if (
        value &&
        typeof value === "object" &&
        Object.prototype.hasOwnProperty.call(value, "default")
      ) {
        checkField(schemaName, key, value);
        return;
      }

      if (value && typeof value === "object") {
        walkSchema(schemaName + "." + key, value);
      }
    });
  }

  Object.keys(schemas).forEach(function (schemaName) {
    walkSchema(schemaName, schemas[schemaName]);
  });

  if (registry && registry.statuses && schemas.Layer && schemas.Layer.status) {
    var defaultStatus = schemas.Layer.status.default;
    if (!registry.statuses[defaultStatus]) {
      errors.push("Layer.status default is not a registered status: " + defaultStatus);
    }
  }

  return { errors: errors, warnings: warnings };
}
Placement

Add these inside the existing window._wos = { ... } object, near the existing registry debug helpers if they already exist.

If _wos.debugRegistry, _wos.listRegistryStatus, or _wos.validateRegistry already exist, place these directly after them.

Forbidden Changes

Do not:

rewrite schema definitions
change schemas.js
change visible UI
change app behavior
move _wos
refactor main.js
Test Checklist

After patching, reload and run:

_wos.debugSchemas()
_wos.validateSchemas()

Expected:

{
  errors: [],
  warnings: []
}

Warnings are acceptable for this pass if they are only informational. Errors should be fixed.
```
