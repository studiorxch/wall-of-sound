// ── RacetrackReadiness v1.1.0 ─────────────────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, extended 0806C
// Status: active | Classification: presentation / racetrack-readiness
//
// Pure, reason-coded "can this selection enter Lobby?" gate — same
// accumulate-EVERY-applicable-reason shape as every other readiness module
// this project has built (computeRaceCourseReadiness/computeRaceLaneReadiness
// on the MUSIC side). Takes an explicit context object rather than reaching
// into any store itself, so it stays pure and independently testable.
//
// Reason codes, exactly per spec:
//   missing_course_package, course_package_invalid, missing_game_format,
//   invalid_competitor_count, missing_competitor, missing_playlist,
//   missing_seed, snapshot_invalid
//
// 0806C — validateRacetrackRaceInput(ctx) added: a distinct "can this frozen
// Lobby snapshot actually begin a race?" gate, called by
// racetrackRaceRuntime.js's pure _validateRaceInput() (never by anything that
// mutates race state — see that file's header comment). Reason codes:
//   missing_course_package, course_package_ref_mismatch,
//   course_package_invalid, invalid_course_distance,
//   insufficient_competitors, missing_seed
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  // ctx: {
  //   coursePackage: RacetrackCoursePackage|null,
  //   gameFormat: GameFormatCatalogEntry|null,
  //   competitors: Array<CompetitorCatalogEntry|null>,  // resolved roster, in order
  //   playlistAvailable: boolean,                        // true if >=1 playlist exists to choose from
  //   seed: string|null,
  // }
  function computeRacetrackReadiness(ctx) {
    var reasons = [];

    if (!ctx.coursePackage) {
      reasons.push('missing_course_package');
    } else if (
      !ctx.coursePackage.route ||
      !Array.isArray(ctx.coursePackage.progressSamples) ||
      ctx.coursePackage.progressSamples.length < 2
    ) {
      reasons.push('course_package_invalid');
    }

    if (!ctx.gameFormat) {
      reasons.push('missing_game_format');
    } else {
      var count = Array.isArray(ctx.competitors) ? ctx.competitors.length : 0;
      if (count < ctx.gameFormat.minCompetitors || count > ctx.gameFormat.maxCompetitors) {
        reasons.push('invalid_competitor_count');
      }
    }

    if (!Array.isArray(ctx.competitors) || ctx.competitors.length === 0 || ctx.competitors.some(function (c) { return !c; })) {
      reasons.push('missing_competitor');
    }

    if (!ctx.playlistAvailable) {
      reasons.push('missing_playlist');
    }

    if (!ctx.seed) {
      reasons.push('missing_seed');
    }

    return { ready: reasons.length === 0, reasons: reasons };
  }

  // A final structural check on the built snapshot itself, run right after
  // assembly and before freezing/transitioning scenes — catches an assembly
  // bug (a required field that ended up missing) distinctly from a
  // readiness gate that never should have allowed the build to start.
  function validateRacetrackSessionSnapshot(snapshot) {
    if (!snapshot) return false;
    if (!snapshot.id || !snapshot.coursePackage || !snapshot.gameFormatSnapshot) return false;
    if (!Array.isArray(snapshot.competitorSnapshots) || snapshot.competitorSnapshots.length === 0) return false;
    if (!snapshot.seed) return false;
    return true;
  }

  // 0806C — a distinct gate from computeRacetrackReadiness above: that one
  // asks "can Selection enter Lobby;" this one asks "can this ALREADY-FROZEN
  // Lobby snapshot actually begin a race." Pure — never reaches into any
  // store, never mutates anything. Caller (racetrackRaceRuntime.js) is
  // responsible for re-resolving the course package and passing whether its
  // id/version/fingerprint match the snapshot's saved ref.
  //
  // ctx: {
  //   coursePackage: RacetrackCoursePackage|null,  // freshly re-resolved, or null if unresolvable
  //   coursePackageRefMatches: boolean,             // id/version/fingerprint match the frozen ref
  //   competitors: Array,                           // frozen competitorSnapshots
  //   seed: string|null,
  // }
  function validateRacetrackRaceInput(ctx) {
    var reasons = [];

    if (!ctx.coursePackage) {
      reasons.push('missing_course_package');
    } else {
      if (!ctx.coursePackageRefMatches) {
        reasons.push('course_package_ref_mismatch');
      }
      if (!ctx.coursePackage.route || !Array.isArray(ctx.coursePackage.progressSamples) || ctx.coursePackage.progressSamples.length < 2) {
        reasons.push('course_package_invalid');
      } else if (!ctx.coursePackage.finish || !(ctx.coursePackage.finish.distanceMeters > 0)) {
        reasons.push('invalid_course_distance');
      }
    }

    var count = Array.isArray(ctx.competitors) ? ctx.competitors.length : 0;
    if (count < 2) {
      reasons.push('insufficient_competitors');
    }

    if (!ctx.seed) {
      reasons.push('missing_seed');
    }

    return { ok: reasons.length === 0, reasons: reasons };
  }

  SBE.RacetrackReadiness = Object.freeze({
    VERSION: VERSION,
    computeRacetrackReadiness: computeRacetrackReadiness,
    validateRacetrackSessionSnapshot: validateRacetrackSessionSnapshot,
    validateRacetrackRaceInput: validateRacetrackRaceInput,
  });

  console.log('[RacetrackReadiness] v' + VERSION + ' loaded');

})(window);
