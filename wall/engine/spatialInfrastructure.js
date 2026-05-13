// 0512_WOS_SpatialInfrastructure_v1.1.0
// Spatial Infrastructure — real-world route corridor for WOS worlds.
// Vanilla IIFE. Attaches to SBE.SpatialInfrastructure.
// Load order: routeIngestion.js → universalClock.js → environmentState.js →
//             agentNeeds.js → spatialInfrastructure.js → aquariumCamera.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// PHILOSOPHY
//   WOS does not invent fake worlds first.
//   It reveals the hidden cinematic structure already present inside reality.
//
//   The route corridor IS the world — the traversal spine, district container,
//   cinematic pacing structure, and environmental progression axis.
//
// PHASE 1 CORRIDOR: Brooklyn (65th & 3rd Ave) → Cold Spring, NY
//   110 km · 2 hr drive · 10 districts · 13 scenic moments · real topology
//
// OWNERSHIP
//   This module owns: spatial world model, corridor, districts, roads, POIs
//   It does NOT own: camera behavior, audio, simulation timing, rendering
//
// PERSIST: corridor raw points, districts, pois (roads are derived)
// NEVER PERSIST: scoring caches, candidate positions, pathfinding state
// ═══════════════════════════════════════════════════════════════════════════

(function initSpatialInfrastructure(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  var _nextId = 1;
  function _id(prefix) { return (prefix || "si") + "_" + (_nextId++); }

  function haversineKm(a, b) {
    var R = 6371, d2r = Math.PI / 180;
    var lat1 = a.lat * d2r, lat2 = b.lat * d2r;
    var dlat = (b.lat - a.lat) * d2r, dlng = (b.lng - a.lng) * d2r;
    var s = Math.sin(dlat / 2) * Math.sin(dlat / 2)
          + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) * Math.sin(dlng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // ── Phase 1 Corridor: Brooklyn → Cold Spring, NY ──────────────────────────
  // 725 sampled points from the KMZ · 110km · format: [lat, lng, elevation]
  var _P1_RAW = [
  [40.63931,-74.02351,0],
  [40.64064,-74.02217,0],
  [40.64204,-74.02038,0],
  [40.64432,-74.01802,0],
  [40.64659,-74.0157,0],
  [40.64875,-74.01335,0],
  [40.64988,-74.01218,0],
  [40.65101,-74.01101,0],
  [40.65213,-74.00984,0],
  [40.65539,-74.00645,0],
  [40.65662,-74.00517,0],
  [40.65783,-74.00392,0],
  [40.66046,-74.00118,0],
  [40.66134,-74.00026,0],
  [40.66229,-73.99928,0],
  [40.66506,-73.99642,0],
  [40.66564,-73.99609,0],
  [40.66692,-73.99583,0],
  [40.66798,-73.99609,0],
  [40.67047,-73.99756,0],
  [40.67575,-74.00092,0],
  [40.67619,-74.00123,0],
  [40.67754,-74.00215,0],
  [40.68003,-74.00418,0],
  [40.68157,-74.00531,0],
  [40.68268,-74.00589,0],
  [40.68646,-74.00781,0],
  [40.68937,-74.01018,0],
  [40.69047,-74.011,0],
  [40.69332,-74.0124,0],
  [40.6988,-74.01441,0],
  [40.7016,-74.01543,0],
  [40.7033,-74.01557,0],
  [40.70429,-74.01538,0],
  [40.7065,-74.01458,0],
  [40.70688,-74.01465,0],
  [40.70704,-74.01475,0],
  [40.70726,-74.01499,0],
  [40.70734,-74.01531,0],
  [40.70733,-74.01563,0],
  [40.70696,-74.0161,0],
  [40.70598,-74.01633,0],
  [40.70487,-74.01673,0],
  [40.70418,-74.01668,0],
  [40.70185,-74.01561,0],
  [40.70123,-74.01449,0],
  [40.70113,-74.0138,0],
  [40.70181,-74.01034,0],
  [40.70201,-74.00964,0],
  [40.70283,-74.0082,0],
  [40.7039,-74.00647,0],
  [40.70516,-74.0045,0],
  [40.70568,-74.00371,0],
  [40.70615,-74.00296,0],
  [40.70836,-73.99892,0],
  [40.70879,-73.99781,0],
  [40.70905,-73.99622,0],
  [40.70939,-73.99361,0],
  [40.71011,-73.98824,0],
  [40.7102,-73.9875,0],
  [40.71035,-73.98624,0],
  [40.71061,-73.98322,0],
  [40.71065,-73.98262,0],
  [40.71107,-73.97939,0],
  [40.71157,-73.97845,0],
  [40.71194,-73.97802,0],
  [40.71664,-73.97549,0],
  [40.72184,-73.97449,0],
  [40.72531,-73.97252,0],
  [40.7268,-73.97187,0],
  [40.72837,-73.97165,0],
  [40.72877,-73.97166,0],
  [40.72984,-73.97215,0],
  [40.73124,-73.97364,0],
  [40.73214,-73.974,0],
  [40.73351,-73.97435,0],
  [40.73422,-73.97453,0],
  [40.73537,-73.97482,0],
  [40.73602,-73.97492,0],
  [40.7368,-73.97473,0],
  [40.73843,-73.97358,0],
  [40.73902,-73.97321,0],
  [40.74061,-73.97267,0],
  [40.74235,-73.97232,0],
  [40.74302,-73.97209,0],
  [40.74344,-73.97185,0],
  [40.74499,-73.97081,0],
  [40.74554,-73.97034,0],
  [40.74859,-73.96753,0],
  [40.75068,-73.9658,0],
  [40.75229,-73.96431,0],
  [40.75397,-73.96286,0],
  [40.7546,-73.96231,0],
  [40.75597,-73.96072,0],
  [40.75709,-73.9599,0],
  [40.75848,-73.95882,0],
  [40.75912,-73.95846,0],
  [40.75974,-73.95837,0],
  [40.76158,-73.96054,0],
  [40.762,-73.96024,0],
  [40.76348,-73.95916,0],
  [40.76468,-73.95829,0],
  [40.7664,-73.95703,0],
  [40.76691,-73.95664,0],
  [40.76746,-73.95624,0],
  [40.76849,-73.95549,0],
  [40.76942,-73.95482,0],
  [40.77159,-73.95323,0],
  [40.77205,-73.95291,0],
  [40.77137,-73.95036,0],
  [40.76981,-73.9488,0],
  [40.77009,-73.94946,0],
  [40.77046,-73.95113,0],
  [40.7704,-73.95216,0],
  [40.77159,-73.95324,0],
  [40.77202,-73.95292,0],
  [40.77247,-73.95286,0],
  [40.77407,-73.95666,0],
  [40.77478,-73.95834,0],
  [40.77572,-73.9606,0],
  [40.77613,-73.96157,0],
  [40.77704,-73.96369,0],
  [40.77754,-73.96453,0],
  [40.77778,-73.9649,0],
  [40.77797,-73.96522,0],
  [40.77813,-73.96604,0],
  [40.77826,-73.96673,0],
  [40.77852,-73.96757,0],
  [40.77887,-73.9684,0],
  [40.77941,-73.9697,0],
  [40.77977,-73.97075,0],
  [40.78023,-73.97138,0],
  [40.78046,-73.97157,0],
  [40.78145,-73.97137,0],
  [40.7817,-73.97134,0],
  [40.7819,-73.97143,0],
  [40.78209,-73.9717,0],
  [40.78265,-73.97501,0],
  [40.78237,-73.97647,0],
  [40.78306,-73.9781,0],
  [40.78489,-73.98245,0],
  [40.78537,-73.98358,0],
  [40.78576,-73.98423,0],
  [40.78587,-73.98431,0],
  [40.78593,-73.98454,0],
  [40.78575,-73.98474,0],
  [40.78557,-73.9846,0],
  [40.78557,-73.98439,0],
  [40.78566,-73.98424,0],
  [40.78531,-73.98344,0],
  [40.78434,-73.98327,0],
  [40.78428,-73.98312,0],
  [40.78366,-73.98161,0],
  [40.78498,-73.98265,0],
  [40.78554,-73.98299,0],
  [40.78651,-73.98301,0],
  [40.78697,-73.98297,0],
  [40.78735,-73.98288,0],
  [40.78779,-73.98284,0],
  [40.78941,-73.98215,0],
  [40.79227,-73.98032,0],
  [40.79356,-73.97923,0],
  [40.79547,-73.97701,0],
  [40.79664,-73.97593,0],
  [40.79715,-73.97567,0],
  [40.79906,-73.97498,0],
  [40.8026,-73.97296,0],
  [40.80881,-73.96834,0],
  [40.81156,-73.96652,0],
  [40.81447,-73.96444,0],
  [40.81571,-73.96369,0],
  [40.81859,-73.9609,0],
  [40.82153,-73.95839,0],
  [40.82315,-73.95714,0],
  [40.825,-73.95567,0],
  [40.82582,-73.95492,0],
  [40.828,-73.95289,0],
  [40.82945,-73.95166,0],
  [40.83043,-73.95106,0],
  [40.83195,-73.95045,0],
  [40.83353,-73.94999,0],
  [40.83464,-73.94966,0],
  [40.83673,-73.94902,0],
  [40.83727,-73.94869,0],
  [40.84,-73.94633,0],
  [40.84255,-73.94518,0],
  [40.84483,-73.9449,0],
  [40.84671,-73.94461,0],
  [40.84894,-73.94352,0],
  [40.84926,-73.94338,0],
  [40.85015,-73.94317,0],
  [40.85121,-73.94281,0],
  [40.85251,-73.9415,0],
  [40.85317,-73.941,0],
  [40.85395,-73.94045,0],
  [40.85505,-73.93992,0],
  [40.85683,-73.93844,0],
  [40.85855,-73.93702,0],
  [40.85922,-73.9364,0],
  [40.85971,-73.93562,0],
  [40.86053,-73.9351,0],
  [40.86105,-73.93501,0],
  [40.86142,-73.93487,0],
  [40.86191,-73.93457,0],
  [40.86298,-73.93392,0],
  [40.8639,-73.93344,0],
  [40.86517,-73.93294,0],
  [40.86868,-73.93088,0],
  [40.8691,-73.93062,0],
  [40.8695,-73.93038,0],
  [40.86999,-73.93008,0],
  [40.87111,-73.92941,0],
  [40.87351,-73.92779,0],
  [40.8746,-73.92672,0],
  [40.87635,-73.92436,0],
  [40.87966,-73.91923,0],
  [40.88202,-73.91644,0],
  [40.88297,-73.91562,0],
  [40.88398,-73.91514,0],
  [40.88464,-73.9146,0],
  [40.88507,-73.914,0],
  [40.88634,-73.91256,0],
  [40.88756,-73.91162,0],
  [40.88827,-73.9107,0],
  [40.88924,-73.90894,0],
  [40.88986,-73.90841,0],
  [40.89087,-73.90816,0],
  [40.89325,-73.90816,0],
  [40.8946,-73.90813,0],
  [40.89593,-73.90804,0],
  [40.89686,-73.90799,0],
  [40.89784,-73.90782,0],
  [40.89852,-73.90757,0],
  [40.89937,-73.90701,0],
  [40.90054,-73.90559,0],
  [40.90101,-73.90417,0],
  [40.90112,-73.90347,0],
  [40.90118,-73.90254,0],
  [40.90094,-73.89965,0],
  [40.90073,-73.89871,0],
  [40.90003,-73.89633,0],
  [40.89974,-73.8952,0],
  [40.89954,-73.89401,0],
  [40.8995,-73.89319,0],
  [40.89958,-73.89193,0],
  [40.89975,-73.89114,0],
  [40.90053,-73.88918,0],
  [40.90244,-73.88683,0],
  [40.90355,-73.88627,0],
  [40.90431,-73.88622,0],
  [40.90549,-73.88642,0],
  [40.90613,-73.88657,0],
  [40.9073,-73.88646,0],
  [40.9088,-73.88577,0],
  [40.91212,-73.88445,0],
  [40.91351,-73.88412,0],
  [40.9148,-73.88381,0],
  [40.9161,-73.8835,0],
  [40.91769,-73.88312,0],
  [40.91938,-73.88262,0],
  [40.92096,-73.88189,0],
  [40.92284,-73.88105,0],
  [40.92468,-73.88087,0],
  [40.92533,-73.88074,0],
  [40.92661,-73.88012,0],
  [40.92829,-73.87896,0],
  [40.93015,-73.87847,0],
  [40.93146,-73.87858,0],
  [40.9324,-73.87887,0],
  [40.93377,-73.87925,0],
  [40.93434,-73.87913,0],
  [40.93585,-73.87851,0],
  [40.93715,-73.87754,0],
  [40.93966,-73.87572,0],
  [40.94222,-73.87523,0],
  [40.94327,-73.87485,0],
  [40.94446,-73.874,0],
  [40.94616,-73.87244,0],
  [40.948,-73.87165,0],
  [40.95208,-73.87217,0],
  [40.9536,-73.87192,0],
  [40.9569,-73.87129,0],
  [40.95747,-73.87142,0],
  [40.95837,-73.87166,0],
  [40.95972,-73.87162,0],
  [40.96074,-73.87138,0],
  [40.96292,-73.87105,0],
  [40.96481,-73.87094,0],
  [40.9668,-73.87114,0],
  [40.96845,-73.87092,0],
  [40.96935,-73.87048,0],
  [40.97071,-73.86959,0],
  [40.97326,-73.86845,0],
  [40.97536,-73.86848,0],
  [40.9767,-73.86848,0],
  [40.97787,-73.8683,0],
  [40.97924,-73.86786,0],
  [40.98372,-73.86632,0],
  [40.98902,-73.86453,0],
  [40.9919,-73.86286,0],
  [40.99393,-73.8617,0],
  [40.99468,-73.86124,0],
  [40.99643,-73.85995,0],
  [41.00033,-73.85771,0],
  [41.00216,-73.85671,0],
  [41.00381,-73.85567,0],
  [41.00558,-73.85439,0],
  [41.00732,-73.85344,0],
  [41.00912,-73.85274,0],
  [41.01065,-73.8518,0],
  [41.01185,-73.85077,0],
  [41.01383,-73.84893,0],
  [41.01509,-73.84827,0],
  [41.01782,-73.8477,0],
  [41.01816,-73.84762,0],
  [41.01856,-73.84752,0],
  [41.02039,-73.84714,0],
  [41.02175,-73.84681,0],
  [41.02349,-73.84634,0],
  [41.02476,-73.84639,0],
  [41.02591,-73.84611,0],
  [41.02635,-73.84586,0],
  [41.02697,-73.84552,0],
  [41.02881,-73.84478,0],
  [41.02914,-73.84469,0],
  [41.02968,-73.84458,0],
  [41.03063,-73.84438,0],
  [41.03147,-73.84417,0],
  [41.03306,-73.84326,0],
  [41.03464,-73.84121,0],
  [41.03668,-73.8396,0],
  [41.03815,-73.8386,0],
  [41.0402,-73.83803,0],
  [41.04087,-73.83779,0],
  [41.04232,-73.83686,0],
  [41.04539,-73.83298,0],
  [41.04654,-73.8309,0],
  [41.04928,-73.82585,0],
  [41.05056,-73.82426,0],
  [41.05237,-73.82286,0],
  [41.05516,-73.82133,0],
  [41.05591,-73.82111,0],
  [41.05654,-73.82118,0],
  [41.05705,-73.82144,0],
  [41.05788,-73.82208,0],
  [41.05879,-73.82257,0],
  [41.06027,-73.82245,0],
  [41.06167,-73.82197,0],
  [41.06228,-73.82199,0],
  [41.06305,-73.82232,0],
  [41.06393,-73.82335,0],
  [41.06502,-73.82503,0],
  [41.06633,-73.82629,0],
  [41.06701,-73.82672,0],
  [41.06774,-73.82705,0],
  [41.06818,-73.82725,0],
  [41.06878,-73.82764,0],
  [41.06951,-73.82841,0],
  [41.07002,-73.82931,0],
  [41.07108,-73.83199,0],
  [41.07193,-73.83285,0],
  [41.07224,-73.83302,0],
  [41.07277,-73.83321,0],
  [41.07318,-73.83333,0],
  [41.07526,-73.83385,0],
  [41.07651,-73.834,0],
  [41.07704,-73.83386,0],
  [41.07791,-73.83335,0],
  [41.07918,-73.83221,0],
  [41.0802,-73.83081,0],
  [41.08067,-73.82953,0],
  [41.08138,-73.8292,0],
  [41.08202,-73.83031,0],
  [41.08237,-73.83102,0],
  [41.08264,-73.83121,0],
  [41.08304,-73.83131,0],
  [41.08346,-73.83155,0],
  [41.08361,-73.83167,0],
  [41.08407,-73.83211,0],
  [41.08453,-73.83272,0],
  [41.08454,-73.83329,0],
  [41.08418,-73.83467,0],
  [41.08432,-73.83537,0],
  [41.08494,-73.83698,0],
  [41.08545,-73.83811,0],
  [41.08553,-73.83876,0],
  [41.0855,-73.83904,0],
  [41.08532,-73.83957,0],
  [41.08516,-73.83979,0],
  [41.08492,-73.84002,0],
  [41.08447,-73.84034,0],
  [41.08436,-73.84047,0],
  [41.0843,-73.84103,0],
  [41.08464,-73.84173,0],
  [41.08486,-73.84233,0],
  [41.08477,-73.84385,0],
  [41.08493,-73.84429,0],
  [41.08515,-73.84466,0],
  [41.08561,-73.84529,0],
  [41.086,-73.84594,0],
  [41.08625,-73.84675,0],
  [41.08654,-73.84729,0],
  [41.08699,-73.84836,0],
  [41.08755,-73.85045,0],
  [41.08762,-73.8509,0],
  [41.08767,-73.85115,0],
  [41.08772,-73.85139,0],
  [41.08811,-73.85193,0],
  [41.08825,-73.85202,0],
  [41.08867,-73.85223,0],
  [41.08893,-73.85234,0],
  [41.08935,-73.85233,0],
  [41.09007,-73.85199,0],
  [41.09104,-73.85154,0],
  [41.09139,-73.85143,0],
  [41.09167,-73.85136,0],
  [41.09235,-73.85111,0],
  [41.09256,-73.85095,0],
  [41.09298,-73.85028,0],
  [41.09366,-73.84919,0],
  [41.09461,-73.84859,0],
  [41.09638,-73.84837,0],
  [41.09687,-73.84828,0],
  [41.09791,-73.84787,0],
  [41.09884,-73.84761,0],
  [41.09907,-73.84737,0],
  [41.09949,-73.84672,0],
  [41.09974,-73.84648,0],
  [41.10044,-73.84639,0],
  [41.10143,-73.84601,0],
  [41.10221,-73.84562,0],
  [41.10338,-73.84522,0],
  [41.10397,-73.84543,0],
  [41.10438,-73.84547,0],
  [41.10478,-73.84518,0],
  [41.10548,-73.84463,0],
  [41.10598,-73.84436,0],
  [41.10633,-73.84461,0],
  [41.10734,-73.84511,0],
  [41.10816,-73.845,0],
  [41.10868,-73.84473,0],
  [41.11023,-73.84288,0],
  [41.1108,-73.84243,0],
  [41.11102,-73.84239,0],
  [41.11149,-73.84261,0],
  [41.11163,-73.84268,0],
  [41.11187,-73.84285,0],
  [41.11214,-73.84303,0],
  [41.11264,-73.84332,0],
  [41.11296,-73.84349,0],
  [41.11313,-73.84355,0],
  [41.11355,-73.84357,0],
  [41.11443,-73.84338,0],
  [41.11509,-73.84328,0],
  [41.11601,-73.84312,0],
  [41.11687,-73.84312,0],
  [41.11769,-73.84323,0],
  [41.11773,-73.84352,0],
  [41.11783,-73.84417,0],
  [41.11811,-73.84483,0],
  [41.11839,-73.84539,0],
  [41.11949,-73.84603,0],
  [41.11968,-73.84615,0],
  [41.11982,-73.84644,0],
  [41.11993,-73.84739,0],
  [41.11974,-73.84787,0],
  [41.11965,-73.84816,0],
  [41.11936,-73.8496,0],
  [41.11848,-73.85069,0],
  [41.11796,-73.85134,0],
  [41.1179,-73.85204,0],
  [41.11799,-73.85353,0],
  [41.11843,-73.85412,0],
  [41.11867,-73.85426,0],
  [41.11943,-73.85453,0],
  [41.12014,-73.85508,0],
  [41.12054,-73.85542,0],
  [41.12068,-73.85557,0],
  [41.12089,-73.85606,0],
  [41.1211,-73.85684,0],
  [41.1217,-73.85824,0],
  [41.1238,-73.86186,0],
  [41.12865,-73.86158,0],
  [41.13007,-73.86121,0],
  [41.13107,-73.86083,0],
  [41.13368,-73.86071,0],
  [41.13611,-73.86085,0],
  [41.13734,-73.86104,0],
  [41.13788,-73.86122,0],
  [41.13823,-73.86142,0],
  [41.1385,-73.86159,0],
  [41.13871,-73.8617,0],
  [41.13948,-73.86181,0],
  [41.14022,-73.8617,0],
  [41.14124,-73.86155,0],
  [41.14222,-73.8614,0],
  [41.14323,-73.86125,0],
  [41.14483,-73.86101,0],
  [41.14574,-73.86088,0],
  [41.14677,-73.86073,0],
  [41.14865,-73.86047,0],
  [41.14937,-73.86031,0],
  [41.15028,-73.86002,0],
  [41.15054,-73.85993,0],
  [41.15164,-73.8597,0],
  [41.15334,-73.85974,0],
  [41.1538,-73.85979,0],
  [41.15438,-73.85991,0],
  [41.15625,-73.86079,0],
  [41.15699,-73.86106,0],
  [41.15772,-73.86097,0],
  [41.15871,-73.8609,0],
  [41.15981,-73.8609,0],
  [41.16241,-73.86152,0],
  [41.16371,-73.86177,0],
  [41.16514,-73.86177,0],
  [41.16613,-73.86192,0],
  [41.1665,-73.86213,0],
  [41.16983,-73.86415,0],
  [41.17055,-73.86468,0],
  [41.17184,-73.86552,0],
  [41.17547,-73.8675,0],
  [41.17785,-73.86877,0],
  [41.17869,-73.86895,0],
  [41.18217,-73.86919,0],
  [41.18374,-73.87054,0],
  [41.1845,-73.8711,0],
  [41.18565,-73.87197,0],
  [41.18697,-73.87376,0],
  [41.18842,-73.8758,0],
  [41.18948,-73.87727,0],
  [41.19008,-73.8781,0],
  [41.19091,-73.87925,0],
  [41.19167,-73.88032,0],
  [41.1927,-73.88172,0],
  [41.19308,-73.88215,0],
  [41.19449,-73.88337,0],
  [41.19579,-73.88409,0],
  [41.19685,-73.8844,0],
  [41.19739,-73.88453,0],
  [41.19857,-73.88487,0],
  [41.19948,-73.88537,0],
  [41.20031,-73.88609,0],
  [41.20093,-73.88686,0],
  [41.20144,-73.88765,0],
  [41.20299,-73.8897,0],
  [41.20532,-73.89186,0],
  [41.20759,-73.89396,0],
  [41.20986,-73.89682,0],
  [41.21227,-73.9031,0],
  [41.21435,-73.90859,0],
  [41.21601,-73.91043,0],
  [41.21771,-73.91143,0],
  [41.21944,-73.91191,0],
  [41.22288,-73.9121,0],
  [41.22419,-73.91203,0],
  [41.22555,-73.9119,0],
  [41.22828,-73.91155,0],
  [41.2296,-73.91138,0],
  [41.2307,-73.91131,0],
  [41.23319,-73.91158,0],
  [41.23499,-73.91219,0],
  [41.23677,-73.91315,0],
  [41.2382,-73.91425,0],
  [41.23939,-73.91526,0],
  [41.24058,-73.91625,0],
  [41.24326,-73.91848,0],
  [41.24511,-73.91964,0],
  [41.24633,-73.92048,0],
  [41.24682,-73.92096,0],
  [41.2476,-73.92198,0],
  [41.24992,-73.92486,0],
  [41.25175,-73.9265,0],
  [41.25301,-73.92738,0],
  [41.25493,-73.92841,0],
  [41.25618,-73.92894,0],
  [41.25715,-73.92934,0],
  [41.25817,-73.92977,0],
  [41.25931,-73.93026,0],
  [41.26035,-73.93074,0],
  [41.26137,-73.93125,0],
  [41.26229,-73.93173,0],
  [41.26361,-73.93244,0],
  [41.26422,-73.93277,0],
  [41.26463,-73.933,0],
  [41.26516,-73.93327,0],
  [41.2666,-73.93385,0],
  [41.26747,-73.93409,0],
  [41.26889,-73.93431,0],
  [41.26954,-73.93432,0],
  [41.27044,-73.93424,0],
  [41.27096,-73.93413,0],
  [41.27206,-73.93369,0],
  [41.27328,-73.93292,0],
  [41.27395,-73.93249,0],
  [41.27628,-73.93117,0],
  [41.27708,-73.93081,0],
  [41.27865,-73.93022,0],
  [41.28004,-73.9299,0],
  [41.28135,-73.92976,0],
  [41.28373,-73.92971,0],
  [41.28543,-73.92922,0],
  [41.28682,-73.92861,0],
  [41.28774,-73.9284,0],
  [41.28852,-73.92844,0],
  [41.2892,-73.92861,0],
  [41.29027,-73.92925,0],
  [41.29182,-73.93126,0],
  [41.29224,-73.93264,0],
  [41.29238,-73.93332,0],
  [41.29265,-73.93395,0],
  [41.29293,-73.93439,0],
  [41.29389,-73.93488,0],
  [41.29455,-73.93468,0],
  [41.29611,-73.93367,0],
  [41.2977,-73.93504,0],
  [41.29868,-73.93502,0],
  [41.30057,-73.93408,0],
  [41.30115,-73.93361,0],
  [41.3014,-73.93333,0],
  [41.30169,-73.93291,0],
  [41.30312,-73.93055,0],
  [41.30407,-73.92963,0],
  [41.30585,-73.92947,0],
  [41.30653,-73.92983,0],
  [41.30751,-73.93044,0],
  [41.30859,-73.9307,0],
  [41.31023,-73.93087,0],
  [41.3112,-73.93049,0],
  [41.31385,-73.92936,0],
  [41.3148,-73.92933,0],
  [41.31561,-73.92968,0],
  [41.31635,-73.93009,0],
  [41.3173,-73.93025,0],
  [41.31895,-73.93025,0],
  [41.3195,-73.93012,0],
  [41.32055,-73.92955,0],
  [41.32105,-73.92928,0],
  [41.32613,-73.92781,0],
  [41.32754,-73.92693,0],
  [41.33014,-73.92533,0],
  [41.33467,-73.92347,0],
  [41.33665,-73.92296,0],
  [41.33765,-73.92262,0],
  [41.33785,-73.92256,0],
  [41.3387,-73.92267,0],
  [41.33985,-73.92349,0],
  [41.34083,-73.92482,0],
  [41.34214,-73.92562,0],
  [41.34536,-73.92661,0],
  [41.34677,-73.9269,0],
  [41.34857,-73.92698,0],
  [41.34954,-73.92667,0],
  [41.34981,-73.9265,0],
  [41.35074,-73.92605,0],
  [41.35475,-73.92522,0],
  [41.35527,-73.92518,0],
  [41.35577,-73.92534,0],
  [41.35705,-73.92573,0],
  [41.3575,-73.92579,0],
  [41.35792,-73.92585,0],
  [41.35871,-73.92578,0],
  [41.35956,-73.92574,0],
  [41.36057,-73.92573,0],
  [41.36189,-73.92571,0],
  [41.36252,-73.92588,0],
  [41.36462,-73.92748,0],
  [41.36755,-73.92941,0],
  [41.36881,-73.93026,0],
  [41.37089,-73.93231,0],
  [41.37155,-73.93317,0],
  [41.37227,-73.93389,0],
  [41.37368,-73.9349,0],
  [41.37398,-73.93519,0],
  [41.37417,-73.93551,0],
  [41.37429,-73.9358,0],
  [41.37434,-73.93625,0],
  [41.37393,-73.938,0],
  [41.37379,-73.93899,0],
  [41.37387,-73.93938,0],
  [41.37423,-73.94012,0],
  [41.37473,-73.94112,0],
  [41.37601,-73.94368,0],
  [41.37653,-73.94375,0],
  [41.37727,-73.94333,0],
  [41.3803,-73.94038,0],
  [41.38091,-73.9389,0],
  [41.38115,-73.93839,0],
  [41.38226,-73.93694,0],
  [41.38526,-73.93495,0],
  [41.38662,-73.9345,0],
  [41.38767,-73.93451,0],
  [41.38917,-73.93475,0],
  [41.39116,-73.93415,0],
  [41.39421,-73.93378,0],
  [41.39577,-73.93329,0],
  [41.3967,-73.9331,0],
  [41.39926,-73.93301,0],
  [41.39981,-73.93288,0],
  [41.40013,-73.93275,0],
  [41.40068,-73.93237,0],
  [41.40153,-73.93151,0],
  [41.40249,-73.93066,0],
  [41.40287,-73.93053,0],
  [41.40351,-73.93058,0],
  [41.40433,-73.9311,0],
  [41.40595,-73.93236,0],
  [41.40703,-73.93317,0],
  [41.40849,-73.93425,0],
  [41.40886,-73.93447,0],
  [41.40931,-73.93469,0],
  [41.4103,-73.93522,0],
  [41.41169,-73.93687,0],
  [41.4123,-73.93739,0],
  [41.41589,-73.93865,0],
  [41.41674,-73.93921,0],
  [41.41739,-73.9401,0],
  [41.41874,-73.94436,0],
  [41.41868,-73.94652,0],
  [41.41845,-73.94745,0],
  [41.41782,-73.94876,0],
  [41.41757,-73.9501,0],
  [41.41781,-73.95112,0],
  [41.41988,-73.95457,0],
  [41.42014,-73.95463,0]
  ];

  // ── Phase 1 District Definitions ──────────────────────────────────────────
  // Boundaries defined by corridor point indices (computed from lat bands).
  // Semantic properties inform: soundtrack, camera interest, traffic, env exposure.
  var _P1_DISTRICTS = [
    { id:"d_bay_ridge",    name:"Bay Ridge / Sunset Park",   type:"residential",  startIdx:0,   endIdx:58,  density:0.75, soundtrackBias:"urban-latin",    weatherExposure:0.40, trafficBias:0.65, routeInfluence:0.6 },
    { id:"d_bk_waterfront",name:"Brooklyn / Waterfront",     type:"industrial",   startIdx:58,  endIdx:82,  density:0.60, soundtrackBias:"industrial",     weatherExposure:0.70, trafficBias:0.55, routeInfluence:0.7 },
    { id:"d_upper_east",   name:"Upper East Side",           type:"downtown",     startIdx:82,  endIdx:162, density:0.95, soundtrackBias:"urban-ambient",  weatherExposure:0.30, trafficBias:0.90, routeInfluence:0.8 },
    { id:"d_upper_man",    name:"Upper Manhattan",           type:"residential",  startIdx:162, endIdx:192, density:0.90, soundtrackBias:"urban-latin",    weatherExposure:0.35, trafficBias:0.80, routeInfluence:0.7 },
    { id:"d_inwood_gwb",   name:"Inwood / GW Bridge",        type:"transit_hub",  startIdx:192, endIdx:234, density:0.70, soundtrackBias:"transitional",   weatherExposure:0.65, trafficBias:0.85, routeInfluence:0.9 },
    { id:"d_yonkers",      name:"Yonkers / Mount Vernon",    type:"suburban",     startIdx:234, endIdx:297, density:0.55, soundtrackBias:"suburban-drift", weatherExposure:0.50, trafficBias:0.60, routeInfluence:0.6 },
    { id:"d_tarrytown",    name:"Tarrytown / Sleepy Hollow", type:"coastal",      startIdx:297, endIdx:351, density:0.35, soundtrackBias:"cinematic",      weatherExposure:0.80, trafficBias:0.40, routeInfluence:0.8 },
    { id:"d_ossining",     name:"Ossining / Croton",         type:"coastal",      startIdx:351, endIdx:483, density:0.30, soundtrackBias:"ambient-water",  weatherExposure:0.85, trafficBias:0.30, routeInfluence:0.7 },
    { id:"d_peekskill",    name:"Cortlandt / Peekskill",     type:"suburban",     startIdx:483, endIdx:527, density:0.40, soundtrackBias:"small-city",     weatherExposure:0.60, trafficBias:0.40, routeInfluence:0.6 },
    { id:"d_cold_spring",  name:"Hudson Valley / Cold Spring",type:"rural",       startIdx:527, endIdx:724, density:0.10, soundtrackBias:"pastoral",       weatherExposure:0.90, trafficBias:0.10, routeInfluence:0.5 },
  ];

  // ── Phase 1 Scenic Moments ────────────────────────────────────────────────
  var _P1_SCENIC = [
    { id:"sm_bay_waterfront",  pointIndex:37,  type:"waterfront",        label:"Upper Bay waterfront",              cinematicValue:0.85 },
    { id:"sm_bk_tunnel",       pointIndex:45,  type:"bridge_crossing",   label:"Battery Tunnel approach",           cinematicValue:0.70 },
    { id:"sm_midtown_skyline", pointIndex:88,  type:"skyline",           label:"Midtown Manhattan skyline (FDR)",   cinematicValue:0.95 },
    { id:"sm_79th_stop",       pointIndex:109, type:"elevated_view",     label:"Upper East Side — 79th St",         cinematicValue:0.65 },
    { id:"sm_gwb",             pointIndex:190, type:"bridge_crossing",   label:"George Washington Bridge",          cinematicValue:0.90 },
    { id:"sm_bronx_dense",     pointIndex:258, type:"dense_intersection",label:"Bronx River approach",              cinematicValue:0.55 },
    { id:"sm_tappan_zee_app",  pointIndex:308, type:"waterfront",        label:"Tappan Zee — Hudson River opens",   cinematicValue:0.88 },
    { id:"sm_tappan_zee_cross",pointIndex:334, type:"bridge_crossing",   label:"Gov. Mario Cuomo Bridge crossing",  cinematicValue:0.92 },
    { id:"sm_ossining",        pointIndex:365, type:"waterfront",        label:"Ossining / Sing Sing waterfront",   cinematicValue:0.75 },
    { id:"sm_peekskill",       pointIndex:487, type:"elevated_view",     label:"Peekskill hillside overlook",       cinematicValue:0.70 },
    { id:"sm_highlands",       pointIndex:545, type:"waterfront",        label:"Hudson Highlands — gorge begins",   cinematicValue:0.88 },
    { id:"sm_cold_spring_app", pointIndex:579, type:"elevated_view",     label:"Cold Spring gorge approach",        cinematicValue:0.82 },
    { id:"sm_cold_spring_arr", pointIndex:724, type:"tunnel_exit",       label:"Cold Spring — journey end",         cinematicValue:0.78 },
  ];

  // ── Phase 1 POIs ──────────────────────────────────────────────────────────
  // Geographically informed. Positions are lat/lng (projected at import time).
  var _P1_POIS_GEO = [
    // Gas stations
    { id:"poi_gas_bay_ridge",  name:"Bay Ridge Hess",             type:"gas_station", lat:40.649, lng:-74.021, districtId:"d_bay_ridge",   services:["fuel","air"],                cinematicValue:0.3 },
    { id:"poi_gas_yonkers",    name:"Yonkers Gas & Go",           type:"gas_station", lat:40.940, lng:-73.881, districtId:"d_yonkers",     services:["fuel","air","carwash"],      cinematicValue:0.3 },
    { id:"poi_gas_tarrytown",  name:"Tarrytown Shell",            type:"gas_station", lat:41.005, lng:-73.862, districtId:"d_tarrytown",   services:["fuel","air"],                cinematicValue:0.4 },
    { id:"poi_gas_ossining",   name:"Ossining Citgo",             type:"gas_station", lat:41.072, lng:-73.836, districtId:"d_ossining",    services:["fuel","air"],                cinematicValue:0.3 },
    { id:"poi_gas_peekskill",  name:"Peekskill BP",               type:"gas_station", lat:41.148, lng:-73.845, districtId:"d_peekskill",   services:["fuel","air"],                cinematicValue:0.35 },
    { id:"poi_gas_cold_spring",name:"Cold Spring Gulf",           type:"gas_station", lat:41.415, lng:-73.951, districtId:"d_cold_spring", services:["fuel"],                      cinematicValue:0.4 },
    // Food stops
    { id:"poi_food_bay_ridge", name:"Bay Ridge Diner",            type:"food_stop",   lat:40.645, lng:-74.020, districtId:"d_bay_ridge",   services:["food","coffee"],             cinematicValue:0.45 },
    { id:"poi_food_uman",      name:"175th Street Bodega",        type:"food_stop",   lat:40.839, lng:-73.940, districtId:"d_upper_man",   services:["food","coffee"],             cinematicValue:0.55 },
    { id:"poi_food_yonkers",   name:"Yonkers Diner",              type:"food_stop",   lat:40.920, lng:-73.890, districtId:"d_yonkers",     services:["food","coffee","restroom"],  cinematicValue:0.40 },
    { id:"poi_food_tarrytown", name:"Tarrytown Main St Café",     type:"food_stop",   lat:41.060, lng:-73.840, districtId:"d_tarrytown",   services:["food","coffee","restroom"],  cinematicValue:0.65 },
    { id:"poi_food_cold_spring",name:"Cold Spring Diner",         type:"food_stop",   lat:41.418, lng:-73.952, districtId:"d_cold_spring", services:["food","coffee","restroom"],  cinematicValue:0.80 },
    // Motels / rest
    { id:"poi_motel_yonkers",  name:"Yonkers Motor Inn",          type:"motel",       lat:40.960, lng:-73.882, districtId:"d_yonkers",     services:["shelter","wifi"],            cinematicValue:0.30 },
    { id:"poi_motel_ossining", name:"Ossining Riverside Motel",   type:"motel",       lat:41.088, lng:-73.841, districtId:"d_ossining",    services:["shelter","wifi"],            cinematicValue:0.50 },
    { id:"poi_rest_gwb",       name:"GW Bridge Scenic Overlook",  type:"rest_area",   lat:40.850, lng:-73.947, districtId:"d_inwood_gwb",  services:["restroom","view"],           cinematicValue:0.80 },
    { id:"poi_rest_tappan",    name:"Tappan Zee Rest Area",       type:"rest_area",   lat:41.020, lng:-73.854, districtId:"d_tarrytown",   services:["restroom","food","fuel"],    cinematicValue:0.65 },
    { id:"poi_rest_hudson",    name:"Hudson Valley Scenic Stop",  type:"scenic_view", lat:41.200, lng:-73.888, districtId:"d_cold_spring", services:["view"],                      cinematicValue:0.92 },
    // Waypoints from original KMZ
    { id:"poi_wp_79th",        name:"532 E 79th St, NYC",         type:"workplace",   lat:40.770, lng:-73.949, districtId:"d_upper_east",  services:[],                            cinematicValue:0.60 },
    { id:"poi_wp_columbia",    name:"W 105th St, Manhattan",      type:"workplace",   lat:40.786, lng:-73.984, districtId:"d_upper_man",   services:[],                            cinematicValue:0.55 },
    { id:"poi_wp_cold_spring", name:"Cold Spring Village",        type:"scenic_view", lat:41.420, lng:-73.955, districtId:"d_cold_spring", services:["food","restroom","view"],    cinematicValue:0.95 },
    // Transit stops
    { id:"poi_transit_ues",    name:"86th St Station (4/5/6)",    type:"transit_stop",lat:40.777, lng:-73.955, districtId:"d_upper_east",  services:["transit"],                   cinematicValue:0.50 },
    { id:"poi_transit_gwb",    name:"GW Bridge Bus Terminal",     type:"transit_stop",lat:40.851, lng:-73.941, districtId:"d_inwood_gwb",  services:["transit","restroom"],        cinematicValue:0.55 },
  ];

  // ── KML / KMZ / GPX / GeoJSON parsers ────────────────────────────────────

  // Parse KML text → [{lat, lng, ele}]
  function _parseKML(text) {
    var doc = (new DOMParser()).parseFromString(text, "application/xml");
    var coords = doc.querySelector("LineString coordinates");
    if (!coords) throw new Error("No LineString/coordinates found in KML");
    return coords.textContent.trim().split(/\s+/).map(function (token) {
      var parts = token.split(",");
      return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), ele: parseFloat(parts[2]) || 0 };
    }).filter(function (p) { return !isNaN(p.lat) && !isNaN(p.lng); });
  }

  // Parse GPX text → [{lat, lng, ele}]
  function _parseGPX(text) {
    var doc = (new DOMParser()).parseFromString(text, "application/xml");
    var pts = [];
    var trkpts = doc.querySelectorAll("trkpt");
    if (!trkpts.length) trkpts = doc.querySelectorAll("rtept");
    trkpts.forEach(function (pt) {
      var ele = pt.querySelector("ele");
      pts.push({
        lat: parseFloat(pt.getAttribute("lat")),
        lng: parseFloat(pt.getAttribute("lon")),
        ele: ele ? parseFloat(ele.textContent) : 0,
      });
    });
    return pts.filter(function (p) { return !isNaN(p.lat) && !isNaN(p.lng); });
  }

  // Parse GeoJSON → [{lat, lng, ele}]
  function _parseGeoJSON(obj) {
    var geo = typeof obj === "string" ? JSON.parse(obj) : obj;
    var coords = [];
    function extractCoords(geom) {
      if (!geom) return;
      if (geom.type === "LineString") coords = coords.concat(geom.coordinates);
      else if (geom.type === "MultiLineString") geom.coordinates.forEach(function (l) { coords = coords.concat(l); });
      else if (geom.type === "FeatureCollection") geom.features.forEach(function (f) { extractCoords(f.geometry); });
      else if (geom.type === "Feature") extractCoords(geom.geometry);
    }
    extractCoords(geo);
    return coords.map(function (c) { return { lng: c[0], lat: c[1], ele: c[2] || 0 }; });
  }

  // ── Project geo points → canvas space ────────────────────────────────────
  function _project(geoPoints, canvas) {
    var RI = SBE.RouteIngestion;
    if (RI) {
      var result = RI.projectLatLngToWorld(geoPoints, canvas, 80);
      return result.points.map(function (p, i) {
        return { lat: p.lat, lng: p.lng, x: p.x, y: p.y, ele: geoPoints[i].ele || 0 };
      });
    }
    // Fallback projection if RouteIngestion not available
    var pad = 80;
    var cw = (canvas && canvas.width) || 1080;
    var ch = (canvas && canvas.height) || 1920;
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    geoPoints.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    });
    var scale = Math.min((cw - pad * 2) / (maxLng - minLng || 0.001), (ch - pad * 2) / (maxLat - minLat || 0.001));
    return geoPoints.map(function (p) {
      return { lat: p.lat, lng: p.lng, ele: p.ele || 0,
               x: pad + (p.lng - minLng) * scale, y: pad + (maxLat - p.lat) * scale };
    });
  }

  // ── Compute cumulative distances ──────────────────────────────────────────
  function _buildCumulative(points) {
    var cum = [0];
    for (var i = 1; i < points.length; i++) {
      var dx = points[i].x - points[i - 1].x;
      var dy = points[i].y - points[i - 1].y;
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    return cum;
  }

  // ── Compute spatial bounds ────────────────────────────────────────────────
  function _bounds(points) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  // ── District lookup from point index ─────────────────────────────────────
  function _districtAtIndex(spatial, idx) {
    var d = spatial.districts.find(function (d) { return idx >= d.startIdx && idx <= d.endIdx; });
    return d || spatial.districts[spatial.districts.length - 1];
  }

  // ── Build corridor from projected points ──────────────────────────────────
  function _buildCorridor(id, sourceType, projPoints) {
    var totalDistanceKm = 0;
    if (projPoints.length > 1) {
      for (var i = 1; i < projPoints.length; i++) {
        totalDistanceKm += haversineKm(projPoints[i - 1], projPoints[i]);
      }
    }
    return {
      id:          id,
      sourceType:  sourceType,
      points:      projPoints,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      districtTransitions: [],
      scenicMoments: [],
      // Runtime caches (never persist)
      _cumulative: _buildCumulative(projPoints),
    };
  }

  // ── Road segments from corridor (derived — not persisted) ─────────────────
  // Thin road segment objects spanning the corridor, typed by district.
  var DISTRICT_ROAD_TYPE = {
    downtown:    "arterial",
    residential: "local",
    industrial:  "local",
    transit_hub: "arterial",
    suburban:    "arterial",
    coastal:     "scenic",
    rural:       "scenic",
  };

  function _buildRoads(corridor, districts) {
    var roads = [];
    var pts = corridor.points;
    for (var i = 0; i + 1 < pts.length; i++) {
      var district = districts.find(function (d) { return i >= d.startIdx && i < d.endIdx; });
      roads.push({
        id:          "road_" + i,
        from:        { x: pts[i].x, y: pts[i].y },
        to:          { x: pts[i + 1].x, y: pts[i + 1].y },
        type:        district ? (DISTRICT_ROAD_TYPE[district.type] || "local") : "local",
        speedLimit:  district ? (district.type === "downtown" ? 40 : district.type === "rural" ? 80 : 55) : 55,
        scenicValue:  district ? district.weatherExposure * 0.5 : 0.3,
        trafficBias:  district ? district.trafficBias : 0.5,
        weatherRisk:  district ? district.weatherExposure * 0.4 : 0.2,
      });
    }
    return roads;
  }

  // ── Project POI lat/lng → canvas xy ──────────────────────────────────────
  function _projectPOIs(pois, corridor) {
    if (!corridor.points.length) return pois;
    // Use first point's canvas transform relative to the bounds
    var pts = corridor.points;
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    pts.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    });
    // Infer scale from corridor projection
    var lngSpan = maxLng - minLng || 0.001;
    var latSpan = maxLat - minLat || 0.001;
    var canvasSpanX = Math.max(...pts.map(function (p) { return p.x; })) - Math.min(...pts.map(function (p) { return p.x; }));
    var canvasSpanY = Math.max(...pts.map(function (p) { return p.y; })) - Math.min(...pts.map(function (p) { return p.y; }));
    var canvasMinX = Math.min(...pts.map(function (p) { return p.x; }));
    var canvasMinY = Math.min(...pts.map(function (p) { return p.y; }));
    var scaleX = canvasSpanX / lngSpan;
    var scaleY = canvasSpanY / latSpan;
    return pois.map(function (poi) {
      var p = Object.assign({}, poi);
      p.x = canvasMinX + (poi.lng - minLng) * scaleX;
      p.y = canvasMinY + (maxLat - poi.lat) * scaleY;
      return p;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // ── makeSpatialWorld ──────────────────────────────────────────────────────
  function makeSpatialWorld(corridor) {
    return {
      corridor:      corridor,
      districts:     [],
      roads:         [],
      pois:          [],
      spatialBounds: corridor ? _bounds(corridor.points) : { minX:0, maxX:0, minY:0, maxY:0 },
    };
  }

  // ── addDistrict ───────────────────────────────────────────────────────────
  function addDistrict(spatial, district) {
    if (!district.id) district.id = _id("d");
    spatial.districts.push(district);
    // Rebuild district transitions on corridor
    _rebuildTransitions(spatial);
    return district;
  }

  function _rebuildTransitions(spatial) {
    if (!spatial.corridor) return;
    var transitions = [];
    var ds = spatial.districts.slice().sort(function (a, b) { return a.startIdx - b.startIdx; });
    for (var i = 0; i + 1 < ds.length; i++) {
      transitions.push({
        fromDistrictId:  ds[i].id,
        toDistrictId:    ds[i + 1].id,
        startPointIndex: ds[i].endIdx - 5,
        endPointIndex:   ds[i + 1].startIdx + 5,
        transitionWeight: 0.5,
      });
    }
    spatial.corridor.districtTransitions = transitions;
  }

  // ── addPOI ────────────────────────────────────────────────────────────────
  function addPOI(spatial, poi) {
    if (!poi.id) poi.id = _id("poi");
    spatial.pois.push(poi);
    return poi;
  }

  // ── findNearestPOI ────────────────────────────────────────────────────────
  function findNearestPOI(spatial, position, type) {
    var best = null, bestD = Infinity;
    spatial.pois.forEach(function (poi) {
      if (type && poi.type !== type) return;
      var d = Math.hypot((poi.x || 0) - position.x, (poi.y || 0) - position.y);
      if (d < bestD) { bestD = d; best = poi; }
    });
    return best;
  }

  // ── spatialInterest ───────────────────────────────────────────────────────
  // Returns 0–1: cinematic / atmospheric interest at a canvas position.
  // Used by AquariumCamera and future soundtrack system.
  function spatialInterest(spatial, position, env, clock) {
    if (!spatial || !position) return 0;

    var score = 0;

    // ── Nearest corridor point → district ──────────────────────────────
    var pts = spatial.corridor && spatial.corridor.points || [];
    var nearestIdx = 0, nearestD = Infinity;
    pts.forEach(function (p, i) {
      var d = Math.hypot(p.x - position.x, p.y - position.y);
      if (d < nearestD) { nearestD = d; nearestIdx = i; }
    });

    var district = _districtAtIndex(spatial, nearestIdx);
    if (district) {
      score += district.weatherExposure * 0.25;
      score += district.density * 0.15;
    }

    // ── Proximity to scenic moments ─────────────────────────────────────
    var scenic = spatial.corridor && spatial.corridor.scenicMoments || [];
    scenic.forEach(function (sm) {
      var smPt = pts[sm.pointIndex];
      if (!smPt) return;
      var d = Math.hypot(smPt.x - position.x, smPt.y - position.y);
      var radius = 200;
      if (d < radius) {
        score += sm.cinematicValue * (1 - d / radius) * 0.4;
      }
    });

    // ── Environmental drama ─────────────────────────────────────────────
    var ES = SBE.EnvironmentState;
    if (env && ES) {
      score += ES.cinematicInterest(env) * 0.2;
      // Weather exposure modifier from district
      if (district) {
        score += ES.cinematicInterest(env) * district.weatherExposure * 0.15;
      }
    }

    // ── Time-of-day bonus ───────────────────────────────────────────────
    var UC = SBE.UniversalClock;
    if (clock && UC) {
      var d = UC.getDerived(clock);
      // Dawn and dusk are high cinematic value
      var h = d.hour;
      var transitionBonus = Math.max(
        Math.max(0, 1 - Math.abs(h - 6)  / 2),  // dawn
        Math.max(0, 1 - Math.abs(h - 19) / 2)   // dusk
      ) * 0.2;
      score += transitionBonus;
      // Night on coastal/rural = atmospheric
      if (d.daylightLevel < 0.1 && district && (district.type === "coastal" || district.type === "rural")) {
        score += 0.15;
      }
    }

    return clamp(score, 0, 1);
  }

  // ── getDistrictAtActor ────────────────────────────────────────────────────
  // Returns the district an actor is currently traversing.
  function getDistrictAtActor(spatial, actor) {
    if (!actor || !spatial.corridor) return null;
    var progress = actor.t || 0;
    var idx = Math.floor(progress * (spatial.corridor.points.length - 1));
    return _districtAtIndex(spatial, idx);
  }

  // ── getNearestScenicMoment ────────────────────────────────────────────────
  function getNearestScenicMoment(spatial, actorT) {
    var pts = spatial.corridor && spatial.corridor.points || [];
    var idx = Math.floor((actorT || 0) * (pts.length - 1));
    var scenic = spatial.corridor && spatial.corridor.scenicMoments || [];
    var best = null, bestD = Infinity;
    scenic.forEach(function (sm) {
      var d = Math.abs(sm.pointIndex - idx);
      if (d < bestD) { bestD = d; best = sm; }
    });
    return best;
  }

  // ── importRouteCorridor ───────────────────────────────────────────────────
  // Accepts: KML text, GPX text, GeoJSON string/object, or a File object (KMZ).
  // Returns a Promise that resolves to a RouteCorridor.
  function importRouteCorridor(fileData, canvas, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      function process(text, sourceType) {
        try {
          var geoPoints;
          if (sourceType === "kml" || sourceType === "kmz") geoPoints = _parseKML(text);
          else if (sourceType === "gpx") geoPoints = _parseGPX(text);
          else geoPoints = _parseGeoJSON(text);

          if (!geoPoints || geoPoints.length < 2) {
            return reject(new Error("Route must have at least 2 points"));
          }

          // Optional downsampling
          var maxPts = opts.maxPoints || 800;
          if (geoPoints.length > maxPts) {
            var step = Math.ceil(geoPoints.length / maxPts);
            var ds = [];
            for (var i = 0; i < geoPoints.length; i += step) ds.push(geoPoints[i]);
            if (ds[ds.length - 1] !== geoPoints[geoPoints.length - 1]) ds.push(geoPoints[geoPoints.length - 1]);
            geoPoints = ds;
          }

          var projPoints = _project(geoPoints, canvas);
          var corridorId = opts.id || _id("corridor");
          resolve(_buildCorridor(corridorId, sourceType, projPoints));
        } catch (e) {
          reject(e);
        }
      }

      if (typeof fileData === "string") {
        // Plain text — detect format
        var type = fileData.trim().startsWith("{") || fileData.trim().startsWith("[")
          ? "geojson" : fileData.includes("<gpx") ? "gpx" : "kml";
        process(fileData, type);

      } else if (fileData instanceof File || (fileData && typeof fileData.name === "string")) {
        // File object — detect by extension
        var name = fileData.name.toLowerCase();
        var ext  = name.split(".").pop();

        if (ext === "kmz") {
          // KMZ: requires JSZip
          var JSZip = global.JSZip;
          if (!JSZip) return reject(new Error("JSZip required for KMZ import. Add <script src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'> to index.html"));
          fileData.arrayBuffer().then(function (buf) {
            JSZip.loadAsync(buf).then(function (zip) {
              var kmlFile = Object.keys(zip.files).find(function (f) { return f.endsWith(".kml"); });
              if (!kmlFile) return reject(new Error("No .kml file found inside KMZ"));
              zip.files[kmlFile].async("text").then(function (text) { process(text, "kmz"); }).catch(reject);
            }).catch(reject);
          }).catch(reject);

        } else {
          var reader = new FileReader();
          reader.onload = function () { process(reader.result, ext === "gpx" ? "gpx" : ext === "geojson" || ext === "json" ? "geojson" : "kml"); };
          reader.onerror = function () { reject(reader.error); };
          reader.readAsText(fileData);
        }

      } else {
        reject(new Error("Unsupported fileData type: " + typeof fileData));
      }
    });
  }

  // ── loadPhase1Corridor ────────────────────────────────────────────────────
  // Returns the pre-bundled Brooklyn → Cold Spring corridor (no file I/O).
  // Accepts canvas to project into correct world space.
  function loadPhase1Corridor(canvas) {
    var geoPoints = _P1_RAW.map(function (p) { return { lat: p[0], lng: p[1], ele: p[2] }; });
    var projPoints = _project(geoPoints, canvas);
    var corridor = _buildCorridor("phase1_brooklyn_coldspring", "kmz", projPoints);

    // Attach scenic moments (point indices are relative to the 725-pt sample)
    corridor.scenicMoments = _P1_SCENIC.map(function (s) { return Object.assign({}, s); });

    return corridor;
  }

  // ── Projection parameter storage ─────────────────────────────────────────
  // Stored in spatial.projection for use by ReferenceGeographyLayer.
  function _computeProjection(corridor) {
    var pts = corridor.points;
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    pts.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    });
    var xs = pts.map(function(p){return p.x;}), ys = pts.map(function(p){return p.y;});
    var canvasMinX = Math.min.apply(null,xs), canvasMaxX = Math.max.apply(null,xs);
    var canvasMinY = Math.min.apply(null,ys), canvasMaxY = Math.max.apply(null,ys);
    return {
      minLat: minLat, maxLat: maxLat,
      minLng: minLng, maxLng: maxLng,
      canvasMinX: canvasMinX, canvasMinY: canvasMinY,
      canvasMaxX: canvasMaxX, canvasMaxY: canvasMaxY,
      scaleX: (canvasMaxX - canvasMinX) / (maxLng - minLng || 0.001),
      scaleY: (canvasMaxY - canvasMinY) / (maxLat - minLat || 0.001),
    };
  }

  // Project a single lat/lng using the stored projection parameters.
  // Returns { x, y } in canvas space.
  function projectGeo(spatial, lat, lng) {
    var proj = spatial && spatial.projection;
    if (!proj) return { x: 0, y: 0 };
    return {
      x: proj.canvasMinX + (lng - proj.minLng) * proj.scaleX,
      y: proj.canvasMinY + (proj.maxLat - lat)  * proj.scaleY,
    };
  }

  // ── buildPhase1World ──────────────────────────────────────────────────────
  // One-call setup: load Phase 1 corridor + districts + roads + POIs.
  function buildPhase1World(canvas) {
    var corridor = loadPhase1Corridor(canvas);
    var spatial  = makeSpatialWorld(corridor);

    // Store projection parameters for ReferenceGeographyLayer alignment
    spatial.projection = _computeProjection(corridor);

    // Add districts
    _P1_DISTRICTS.forEach(function (d) { addDistrict(spatial, Object.assign({}, d)); });

    // Build derived road segments
    spatial.roads = _buildRoads(corridor, spatial.districts);

    // Add POIs (project their lat/lng into canvas space)
    var projectedPOIs = _projectPOIs(_P1_POIS_GEO, corridor);
    projectedPOIs.forEach(function (poi) { addPOI(spatial, Object.assign({}, poi)); });

    console.log("[SpatialInfrastructure] Phase 1 world built —",
      corridor.points.length, "pts ·", spatial.districts.length, "districts ·",
      spatial.roads.length, "road segs · ", spatial.pois.length, "POIs ·",
      corridor.totalDistanceKm, "km");

    return spatial;
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  // Persist: corridor points + districts + pois. Roads are derived at runtime.
  function serializeSpatial(spatial) {
    if (!spatial) return null;
    return {
      corridor: spatial.corridor ? {
        id:             spatial.corridor.id,
        sourceType:     spatial.corridor.sourceType,
        totalDistanceKm: spatial.corridor.totalDistanceKm,
        points:         spatial.corridor.points.map(function (p) {
                          return [Math.round(p.lat*100000)/100000, Math.round(p.lng*100000)/100000, Math.round(p.ele||0),
                                  Math.round(p.x*10)/10, Math.round(p.y*10)/10];
                        }),
        scenicMoments:  spatial.corridor.scenicMoments,
        districtTransitions: spatial.corridor.districtTransitions,
      } : null,
      districts: spatial.districts,
      pois:      spatial.pois.map(function (p) {
                   var o = Object.assign({}, p);
                   // Round canvas coords
                   if (o.x != null) { o.x = Math.round(o.x * 10) / 10; o.y = Math.round(o.y * 10) / 10; }
                   return o;
                 }),
    };
  }

  function rehydrateSpatial(saved, canvas) {
    if (!saved) return null;
    var spatial = makeSpatialWorld(null);

    if (saved.corridor) {
      var pts = (saved.corridor.points || []).map(function (p) {
        // Compact format: [lat, lng, ele, x, y]
        if (Array.isArray(p)) return { lat: p[0], lng: p[1], ele: p[2]||0, x: p[3], y: p[4] };
        return p;
      });
      // If x/y are missing (old save), re-project from lat/lng
      if (pts.length > 0 && (pts[0].x == null || isNaN(pts[0].x))) {
        pts = _project(pts, canvas);
      }
      spatial.corridor = {
        id:             saved.corridor.id,
        sourceType:     saved.corridor.sourceType,
        totalDistanceKm: saved.corridor.totalDistanceKm,
        points:         pts,
        scenicMoments:  saved.corridor.scenicMoments  || [],
        districtTransitions: saved.corridor.districtTransitions || [],
        _cumulative:    _buildCumulative(pts),
      };
      spatial.spatialBounds = _bounds(pts);
      spatial.projection    = _computeProjection(spatial.corridor);
    }

    spatial.districts = (saved.districts || []);
    spatial.pois      = (saved.pois || []);
    spatial.roads     = spatial.corridor ? _buildRoads(spatial.corridor, spatial.districts) : [];

    return spatial;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  // ── importEmbeddedCorridor ────────────────────────────────────────────────
  // Synchronous. Returns the Phase 1 corridor projected into canvas space.
  // canvas is optional — defaults to 1080×1920 portrait.
  // This is the canonical entry point for the runtime bootstrap.
  function importEmbeddedCorridor(canvas) {
    return loadPhase1Corridor(canvas || { width: 1080, height: 1920 });
  }

  // ── summary ───────────────────────────────────────────────────────────────
  // Returns a compact diagnostic object for console inspection.
  function summary(spatial) {
    if (!spatial) return null;
    var c = spatial.corridor;
    return {
      corridor:  c ? { id: c.id, points: c.points.length, km: c.totalDistanceKm, source: c.sourceType } : null,
      districts: (spatial.districts || []).map(function (d) { return d.name + " (" + d.type + ")"; }),
      pois:      (spatial.pois || []).length,
      roads:     (spatial.roads || []).length,
      scenic:    c ? (c.scenicMoments || []).length : 0,
      bounds:    spatial.spatialBounds,
    };
  }

  SBE.SpatialInfrastructure = {
    // World construction
    makeSpatialWorld:        makeSpatialWorld,
    addDistrict:             addDistrict,
    addPOI:                  addPOI,
    buildPhase1World:        buildPhase1World,
    loadPhase1Corridor:      loadPhase1Corridor,
    importEmbeddedCorridor:  importEmbeddedCorridor,  // synchronous bootstrap entry point
    // Import (async, file-based)
    importRouteCorridor:     importRouteCorridor,
    // Query
    findNearestPOI:          findNearestPOI,
    spatialInterest:         spatialInterest,
    getDistrictAtActor:      getDistrictAtActor,
    getNearestScenicMoment:  getNearestScenicMoment,
    projectGeo:              projectGeo,
    summary:                 summary,
    // Persistence
    serializeSpatial:        serializeSpatial,
    rehydrateSpatial:        rehydrateSpatial,
    // Internal parsers (exposed for testing)
    _parseKML:     _parseKML,
    _parseGPX:     _parseGPX,
    _parseGeoJSON: _parseGeoJSON,
  };

  console.log("[WOS SpatialInfrastructure] Loaded — Phase 1: Brooklyn → Cold Spring, NY · 110km");
})(window);
