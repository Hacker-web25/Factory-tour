/* VPV welcome — built from scripts/welcome/welcome.src.js. Do not edit by hand.
 * Pen paths: Satisfy (SIL Open Font License 1.1) as hand-traced for Vara (MIT).
 * See scripts/welcome/README.md. */
/*
 * The welcome that writes itself — shown ONLY to someone who arrived by scanning
 * their own QR code (the gate in lib/welcome/gate.ts decides that; this file is
 * not even downloaded for anyone else).
 *
 * It writes "welcome" and then the person's first name, stroke by stroke, in a
 * pen that is visible at its tip, over a translucent blue glass. About two
 * seconds, tap anywhere to skip, and the page is already loading underneath.
 *
 * The handwriting is real pen-path data (see scripts/welcome/README.md for where
 * it comes from), so the strokes follow the letters the way a hand would instead
 * of a left-to-right wipe.
 *
 * Source of public/welcome/welcome.js. Edit THIS file and run
 *   node scripts/welcome/build.mjs
 */
(function () {
  "use strict";

  var F = {"space":10.36,"sw":0.5,"g":{"A":{"x":-0.61,"y":-19.11,"w":13.94,"h":23.62,"l":[50.83,14.25],"p":[["m 0,0 c 1.46,0.25,6.25,-23.63,12.07,-22.4,3.21,0.67,-3.42,23.86,-0.89,23.57",0,-3.34],["m 0,0 c 4.56,-2.95,9.49,-0.45,13.94,-1.08",-0.61,4.14]]},"B":{"x":-5.85,"y":-19.44,"w":12.35,"h":22.52,"l":[74.31],"p":[["m 0,0 c -1.53,7.16,-3.57,14.48,-5.85,21.89,0,0,8.65,3.27,11.32,-5.14,1.38,-4.37,-6.97,-6.87,-7.16,-5,-0.3,3,11.72,-6.37,7.16,-10.99,-2.34,-2.37,-9.64,2.62,-9.64,2.62",0,19.44]]},"C":{"x":-9.74,"y":-19.08,"w":12.58,"h":22.34,"l":[47.28],"p":[["m 0,0 c 1.93,0.56,4.93,-6.76,0.7,-7.76,-7.51,-1.79,-15.13,19.63,-6.83,22.12,3.32,1,6.5,-4.68,6.5,-4.68",0,11.21]]},"D":{"x":-4.63,"y":-18.98,"w":13.02,"h":21.62,"l":[56.07],"p":[["m 0,0 c -1.36,5.61,-2.24,11.07,-4.63,17.03,-0.15,-0.12,9.09,4.63,12.68,-10.62,2.22,-9.46,-6.94,-13.38,-10.56,-7.86",0,15.0]]},"E":{"x":-10.05,"y":-19.43,"w":12.77,"h":22.75,"l":[58.41],"p":[["m 0,0 c 1.52,-0.52,4.88,-5.12,0.7,-6.78,-2.73,-1.09,-6.65,1.31,-7.62,4.72,-1.65,5.75,4.75,8.63,5.14,6.92,0.49,-2.13,-9.73,1.16,-8.09,7.02,2.43,8.72,11.25,0.16,10.8,-2.34",0,12.38]]},"F":{"x":-3.5,"y":-19.28,"w":11.81,"h":22.85,"l":[40.83,11.11],"p":[["m 0,0 c 0,0,-4.14,-1.38,-3.41,-2.62,1.97,-3.34,12.35,-4.55,11.69,-1.08,-0.93,4.9,-9.56,20.19,-7.39,20.77",0,13.5],["m 0,0 c 3.68,-0.63,7.36,-1.19,11.04,-0.47",-2.76,7.89]]},"G":{"x":-9.56,"y":-19.18,"w":12.93,"h":23.01,"l":[64.66],"p":[["m 0,0 c 2.58,-0.23,3.42,-7.69,0.61,-8.23,-7.79,-1.5,-14.34,19.97,-6.92,22.78,4.32,1.63,8.18,-9.86,7.06,-9.81,-1.73,0.36,-3.13,0.13,-4.86,0.08,2.49,0.28,4.99,-0.07,7.48,-0.33",0,10.88]]},"H":{"x":-5.52,"y":-19.02,"w":14.64,"h":22.78,"l":[23.44,53.79],"p":[["m 0,0 c -2.05,7.52,-3.84,15.13,-5.52,22.78",0,19.02],["m 0,0 c -2.29,7.34,-4.3,14.69,-5.47,22.03,0.54,-3.88,0.84,-12.86,-8.65,-10.29,4.8,-1.33,9.37,-1.27,13.8,-0.23",9.12,18.74]]},"I":{"x":-8.15,"y":-18.76,"w":11.75,"h":22.34,"l":[33.27],"p":[["m 0,0 c -0.33,-0.22,1.79,-2.09,3.16,-1.82,2.08,0.4,-3.6,22.24,-7.37,22.31,-2.2,0.04,-3.94,-2.51,-3.94,-2.51",0,16.91]]},"J":{"x":-12.21,"y":-18.29,"w":16.11,"h":22,"l":[39.76,9.44],"p":[["m 0,0 c 0,0,-1.74,22.91,-9.66,21.96,-5.07,-0.61,-1.68,-10,2.32,-10.65",0,18.28],["m 0,0 c 3.3,-0.37,6.62,-0.77,9.39,-0.13",-5.49,17.82]]},"K":{"x":-5.23,"y":-19.21,"w":12.37,"h":24.71,"l":[23.11,42.84],"p":[["m 0,0 c -2.42,7.5,-4.04,14.99,-5.23,22.49",0,19.01],["m 0,0 c -1.11,8.9,-6.16,11.96,-11.94,13.1,0,0,8.84,-2.46,7.9,1.42,-1.74,7.2,-2.8,11.88,3.31,9.62",7.14,19.21]]},"L":{"x":-2.76,"y":-18.92,"w":15.25,"h":22.62,"l":[62.94],"p":[["m 0,0 c 2.66,3.28,16.64,-4.95,11.27,-7.76,-6.18,-3.24,-7.82,28.58,-13.89,20.07,-0.51,-0.71,0.42,-2.07,1.87,-1.77,2.81,0.58,9.92,7.64,11.04,1.77",0,10.93]]},"M":{"x":-3.08,"y":-18.89,"w":19.27,"h":22.23,"l":[98.32],"p":[["m 0,0 c -2.3,1.01,-5.08,9.97,-0.99,10.38,4.24,0.43,6.43,-21.9,8.53,-21.89,-0.56,6.35,-1.14,12.04,0.66,18.12,1.46,-6.24,4.56,-12.19,7.94,-18.26,0.66,7.34,-5.83,21.22,-0.2,22.23",0,7.24]]},"N":{"x":-0.02,"y":-19.13,"w":15.24,"h":22.48,"l":[81.43],"p":[["m 0,0 c -0.31,-7.21,2.8,-14.62,4.2,-21.93,0.93,7.4,1.06,15.28,2.88,21.8,0.54,-0.07,2.64,-23.64,7.14,-22.29,0.61,0.18,0.9,1.19,0.95,1.57,0.66,5.16,-6.26,6.7,-7.1,5.31",0,-3.35]]},"O":{"x":-8.32,"y":-19.42,"w":11.61,"h":22.98,"l":[56.64],"p":[["m 0,0 c -6.27,-0.68,-12.64,22.13,-4.43,22.95,7.38,0.74,11.27,-27.79,3.31,-21.03",0,19.41]]},"P":{"x":-5.75,"y":-18.74,"w":13.55,"h":22.08,"l":[21.51,30.5],"p":[["m 0,0 c -1.51,6.9,-3.03,13.8,-5.75,20.7",0,17.36],["m 0,0 c -0.02,0.01,10.25,-7.75,11.67,0.99,1.28,7.89,-10.52,9.26,-10.52,9.26",-3.97,15.57]]},"Q":{"x":-2.87,"y":-18.87,"w":12.69,"h":22.56,"l":[66.51],"p":[["m 0,0 c -5.39,2.82,-3.16,-19.78,6.36,-18.05,7.58,1.37,-2.96,27.03,-7.2,20.11,-0.81,-1.31,0.15,-2.04,0.57,-2.14,3.41,-0.78,9.31,6.2,10.09,4.1",0,0.73]]},"R":{"x":-5.33,"y":-18.87,"w":12.81,"h":23.51,"l":[21.54,52.92],"p":[["m 0,0 c -1.4,6.95,-3.18,13.91,-5.33,20.86",0,17.43],["m 0,0 c -0.04,-1.01,8.96,-6.49,11.09,-1.45,2.89,6.86,-10.28,14.79,-11.46,10.06,-0.13,-0.52,0.69,-0.88,0.69,-0.88,9.15,-2.55,4.93,17.21,10.35,11.03",-4.02,15.32]]},"S":{"x":-10.37,"y":-19.43,"w":11.2,"h":23.22,"l":[46.77],"p":[["m 0,0 c 0,0,2.25,-5.3,-0.66,-6.68,-2.77,-1.31,-6.81,1.25,-6.86,4.89,-0.05,3.8,7.48,8.7,4.34,14.79,-1.84,3.57,-3.97,3.43,-5.09,2.92,-3.19,-1.45,-1.79,-6.07,-1.79,-6.07",0,12.4]]},"T":{"x":0,"y":-18.16,"w":12.63,"h":21.84,"l":[12.72,22.3],"p":[["m 0,0 c 4.21,-1.17,8.42,-1.09,12.63,-1.06",0,17.09],["m 0,0 c -2.15,7.38,-3.99,14.66,-5.09,21.7",7.01,18.02]]},"U":{"x":-4.43,"y":-19.08,"w":13.36,"h":22.49,"l":[72.25],"p":[["m 0,0 c 0,0,-8.8,21.19,-1.59,21.63,6.45,0.4,9.19,-22.09,10.52,-22.09,-2.3,7.32,-4.57,14.65,-3.77,22.49",0,18.62]]},"V":{"x":-2.3,"y":-18.95,"w":11.36,"h":22.23,"l":[46.86],"p":[["m 0,0 c -2.19,7.8,-3.97,17.85,0.33,22.23,3.51,-7.43,4.84,-14.73,8.73,-22.09",0,18.95]]},"W":{"x":-4.28,"y":-19.35,"w":17.5,"h":22.25,"l":[89.23],"p":[["m 0,0 c -0.54,0,-7.76,21.43,-2.18,21.3,3.66,-0.09,9.35,-18.36,7.94,-18.72,-1.64,-0.41,-2.96,18.76,0.4,19.18,5.45,0.68,8.36,-18.52,6.48,-22.23",0,18.88]]},"X":{"x":-5.49,"y":-19.24,"w":16.54,"h":22.59,"l":[40.95,28.09],"p":[["m 0,0 c -1.32,3.76,-6.16,-2.3,-2.65,-5.16,0.82,-0.67,1.72,-0.93,2.34,-0.42,2.87,2.34,1.02,19.52,5.26,22.18,1.41,0.88,4.23,-2.65,4.23,-2.65",0,13.39],["m 0,0 c -4.65,0.27,-8.83,14.16,-16.54,22.19",11.05,19.01]]},"Y":{"x":-3.87,"y":-19.25,"w":12.01,"h":22.39,"l":[65.26],"p":[["m 0,0 c 0,0,-6.22,14.06,-1.13,15.57,5.85,1.74,9.27,-15.57,9.27,-15.57,-0.41,-0.07,-1.94,20.67,-8.55,22.25,-2.21,0.53,-2.85,-0.58,-3.46,-1.5",0,19.25]]},"Z":{"x":-3.74,"y":-18.39,"w":12.72,"h":21.12,"l":[44.07],"p":[["m 0,0 c 2.99,-1.28,5.99,-0.9,8.98,-0.75,-2.2,7.61,-10.38,14.39,-12.72,20.95,3.65,-1.05,7.19,-1.7,10.1,-0.28",0,17.47]]},"a":{"x":-6.08,"y":-10.75,"w":13.05,"h":10.22,"l":[43.93],"p":[["m 0,0 c 0,0,0.38,-2,-0.33,-2.1,-3.42,-0.5,-7.73,8.22,-4.75,9.96,3.03,1.78,6.41,-6.9,6.43,-7.86,0,0,-2.85,7.36,-0.37,7.93,2.51,0.57,5.99,-6.1,5.99,-6.1",0,8.63]]},"b":{"x":-0.96,"y":-18.41,"w":12.43,"h":17.84,"l":[54.67],"p":[["m 0,0 c 0,0,6.17,-12.39,4.12,-12.35,-1.98,0.04,-8.16,16.61,-3.18,17.78,3.84,0.9,6.74,-8.02,4.86,-8.87,-0.35,-0.16,-0.96,-0.04,-1.22,0.52,-1.29,2.76,6.89,-0.01,6.89,-0.01",0,6.06]]},"c":{"x":-4.77,"y":-11,"w":10.85,"h":10.54,"l":[30.76],"p":[["m 0,0 c 1.89,0.67,2.85,-2.81,0.89,-3.41,-3.43,-1.06,-8.99,8.31,-3.04,10.34,3.3,1.13,8.23,-6.45,8.23,-6.45",0,7.51]]},"d":{"x":-6.8,"y":-18.35,"w":14.31,"h":17.82,"l":[68.33],"p":[["m 0,0 c 0,0,0.8,-3.28,-1.1,-3.34,-4.62,-0.16,-7.48,8.23,-4.45,9.69,5.87,2.84,12.02,-17.3,10.11,-17.44,-1.96,-0.14,-7.31,17.02,-3.46,17.8,2.17,0.44,6.3,-6.49,6.41,-6.44",0,7.26]]},"e":{"x":-0.11,"y":-11.1,"w":10.8,"h":10.53,"l":[36.19],"p":[["m 0,0 c 0.33,0.39,8.49,-4.09,6.18,-6.52,-3.05,-3.21,-10.12,9.39,-3.64,9.99,3.87,0.36,8.42,-6.09,8.14,-6.09",0,4.06]]},"f":{"x":-5.81,"y":-18.32,"w":12.08,"h":29.14,"l":[62.3],"p":[["m 0,0 c 1.82,1.99,-4.94,20.83,-5.8,28.39,-0.36,3.18,7.66,-4.53,7.06,-8.28,-0.55,-3.45,-6.1,-5.32,-5.54,-6.64,1.28,-3.07,10.55,-3.22,10.55,-3.23",0,18.32]]},"g":{"x":-6.75,"y":-10.64,"w":12.94,"h":22.2,"l":[76.25],"p":[["m 0,0 c 0,0,0.33,-3.63,-1.98,-3.57,-3.29,0.09,-5.58,7.93,-2.65,9.43,3.29,1.68,6.52,-8.96,6.52,-8.96,-0.4,0,-3.12,21.61,-6.32,21.73,-2.15,0.08,-3.04,-6.1,-1.65,-7.74,2.01,-2.39,12.06,-8.57,12.27,-10.32",0,7.07]]},"h":{"x":-3.9,"y":-18.22,"w":12.63,"h":17.59,"l":[50.86],"p":[["m 0,0 c -0.92,7.45,-2.6,11.73,-3.9,17.59,0,0,2.19,-11.01,7.13,-9.78,3.02,0.76,-2.37,6.98,-1.31,9.25,1.2,2.57,6.81,-5.16,6.81,-5.16",0,18.22]]},"i":{"x":-1.86,"y":-16.64,"w":7.58,"h":16.01,"l":[19.89,6.29],"p":[["m 0,0 c 0,0,-3.55,8.45,-0.83,9.82,1.95,0.99,6.53,-6.3,6.55,-6.28",0,10.55],["m 0,0 c 1.15,0.47,0.22,2.57,-1.05,1.89,-0.85,-0.45,0,-2.32,1.05,-1.89 z",1.86,16.58]]},"j":{"x":-8.55,"y":-16.74,"w":13.93,"h":27.06,"l":[46.13,6.29],"p":[["m 0,0 c 0,0,-3.61,21.85,-6.64,20.53,-7.5,-3.26,9.35,-13.29,12.02,-17.21",0,10.27],["m 0,0 c 1.15,0.47,0.22,2.57,-1.05,1.89,-0.85,-0.45,0,-2.32,1.05,-1.89 z",1.94,16.68]]},"k":{"x":-3.93,"y":-18.27,"w":12.41,"h":17.68,"l":[56.69],"p":[["m 0,0 c -0.16,5.75,-2.62,11.79,-3.93,17.68,0,0,4.09,-12.03,7.67,-9.87,1.66,1,-2.85,6.85,-4.19,5.77,-0.34,-0.28,-0.32,-0.35,-0.2,-0.91,0.11,-0.54,0.55,-0.45,1.01,-0.28,2,0.76,0.98,5.02,2.27,5.14,2.71,0.26,5.85,-5.71,5.85,-5.71",0,18.27]]},"l":{"x":-3.7,"y":-18.15,"w":3.7,"h":17.69,"l":[18.1],"p":[["m 0,0 c -0.28,5.79,-2.47,11.8,-3.7,17.69",0,18.15]]},"m":{"x":-1.85,"y":-10.53,"w":19.48,"h":10.18,"l":[66.43],"p":[["m 0,0 c 0.58,2.64,-1.23,6.28,-1.85,9.43,0,0,4.55,-11.76,7.41,-9.82,2.28,1.54,-1.52,9.66,-1.52,9.66,0,0,3.63,-10.83,6.91,-9.79,3.2,1.01,-1.58,9.63,0.03,10.05,2.54,0.67,6.65,-6.71,6.65,-6.71",0,9.92]]},"n":{"x":-2.22,"y":-10.45,"w":12.93,"h":9.86,"l":[42.24],"p":[["m 0,0 c -0.29,3.21,-1.46,6.42,-2.22,9.62,0,0,2.71,-10.84,6.48,-9.79,3.12,0.87,-1.99,9.57,0.4,9.72,2.92,0.19,6.05,-6.32,6.05,-6.32",0,10.21]]},"o":{"x":-1.86,"y":-10.46,"w":11.91,"h":10,"l":[41.71],"p":[["m 0,0 c -2.05,1.99,-2.95,8.73,0.17,8.7,6.72,-0.06,5.6,-13.88,0.13,-8.93,-1.1,0.99,-0.77,2.95,-0.05,3.76,2.15,2.38,9.93,-1.54,9.8,-3.23",0,9.16]]},"p":{"x":-4.35,"y":-10.39,"w":14.69,"h":20,"l":[20.43,34.97],"p":[["m 0,0 c 0.8,1.25,-2.9,13.25,-4.35,19.88",0,10.27],["m 0,0 c 0,0,3.75,-4.54,5.33,-3.27,2.83,2.25,-6.34,12.31,-6.41,8.93,-0.04,-2.35,7.76,4.98,11.65,-5.56",-0.23,6.9]]},"q":{"x":-6.27,"y":-10.18,"w":11.7,"h":20.5,"l":[66.96],"p":[["m 0,0 c 0,0,0.06,-2.94,-1.54,-2.9,-3.71,0.09,-6.44,8.21,-3.46,9.59,3.43,1.58,7.02,-9.59,7.02,-9.59,-2.01,2.9,-6.53,23.19,-5.03,20.2,0.76,-1.5,6.84,-11.23,8.44,-14.4",0,7.28]]},"r":{"x":0,"y":-12.15,"w":13.38,"h":11.61,"l":[39.18],"p":[["m 0,0 c 0,0,5.68,-9.55,5.73,-10.75,0.02,-0.39,-0.64,-0.85,-1.31,-0.23,-2.54,2.36,0.87,3.53,2.97,3.26,2.68,-0.35,-3.21,6.54,-0.84,7.86,2.67,1.48,6.83,-6.13,6.83,-6.13",0,0.87]]},"s":{"x":0,"y":-11.87,"w":5.47,"h":11.43,"l":[26.96],"p":[["m 0,0 c 0,0,6.95,-6.74,4.2,-6.91,-3.35,-0.21,1.56,6.8,1.26,9.13,-0.21,1.6,-1.94,2.43,-3.04,2.28,-1.08,-0.14,-1.59,-2.84,-1.59,-2.84",0,4.96]]},"t":{"x":-6.74,"y":-18.18,"w":12.21,"h":17.77,"l":[28.33,12.25],"p":[["m 0,0 c 0.04,3.04,-5.22,13.29,-2.95,17.26,1.54,2.7,7.3,-6.17,7.3,-6.17",0,18.18],["m 0,0 c 3.73,0.85,8.13,-0.67,12.21,0.05",-6.74,14.15]]},"u":{"x":-1.75,"y":-10.07,"w":12.88,"h":9.58,"l":[42.72],"p":[["m 0,0 c -0.57,-0.09,-3.44,8.46,-0.33,9.45,3.62,1.15,7.8,-9.19,6.36,-9.45,-1.47,-0.27,-3.15,6.25,-1.17,9.35,1.04,1.62,6.27,-6.34,6.27,-6.34",0,10.06]]},"v":{"x":-1.1,"y":-10.48,"w":12.51,"h":10.16,"l":[35.29],"p":[["m 0,0 c -1.85,3.56,-1.14,7.23,0.46,9.99,3.59,-2.59,7.06,-9.32,6.84,-9.95,-0.13,-0.38,-0.63,-0.18,-0.95,0.16,-4.23,4.63,2.11,6.36,5.06,2.15",0,10.31]]},"w":{"x":-1.4,"y":-10.6,"w":17.58,"h":10.15,"l":[60.58],"p":[["m 0,0 c 0,0,-3.19,9.21,0.05,10.01,3.7,0.92,7.09,-10.11,5.38,-10.1,-2.15,0,-3.52,9.65,0.51,10.06,3.19,0.32,5.27,-8.53,5.33,-9.56,0.04,-0.67,-0.89,-0.67,-1.26,0.11,-3.2,6.74,5.96,4.54,6.17,2.15",0,10.51]]},"x":{"x":-2.15,"y":-10.84,"w":11.75,"h":10.31,"l":[18.6,13.75],"p":[["m 0,0 c 2.66,3.05,1.89,9.99,4.37,10.25,2.59,0.28,5.23,-4.33,5.23,-4.33",0,10.84],["m 0,0 c -2.8,3.45,-5.75,6.89,-9.16,10.25",7.01,10.78]]},"y":{"x":-1.46,"y":-10.41,"w":7.66,"h":20.16,"l":[43.12],"p":[["m 0,0 c 0.83,1.87,-3.34,8.37,-0.39,9.36,3.65,1.23,6.59,-9.49,6.59,-9.49,-1.67,6.67,-3.57,13.28,-4.54,20.16",0,10.28]]},"z":{"x":-3.03,"y":-10.28,"w":13.19,"h":20.02,"l":[60.55],"p":[["m 0,0 c 2.15,-1.35,4.46,-1.01,6.74,-1.08,-1.32,3.1,-3.59,5.66,-5.75,8.28,0,0,3.23,-2.76,4.26,-1.64,3.32,3.63,-4.24,14.76,-6.5,13.24,-7.3,-4.94,10.18,-11.26,11.41,-15.2",0,9.2]]},"'":{"x":-1.79,"y":-19.31,"w":1.79,"h":7.21,"l":[7.44],"p":[["m 0,0 c -0.82,2.45,-1.41,4.85,-1.79,7.21",0,19.31]]},"-":{"x":0,"y":-8.71,"w":8.63,"h":0.29,"l":[8.64],"p":[["m 0,0 c 2.88,-0.34,5.75,-0.35,8.63,-0.19",0,8.42]]},".":{"x":-3.08,"y":-2.67,"w":3.11,"h":2.31,"l":[8.42],"p":[["m 0,0 c 0.36,1.17,-2.35,2.73,-3.02,1.47,-0.54,-1.03,2.69,-2.55,3.02,-1.47 z",0,2.3]]}},"k":{"j":-5,"p":-3.5}};
  if (document.getElementById("vpv-hi")) return; // already running
  if (!document.body) {
    // Loaded before the body exists (rare: the script is async). Wait for it.
    document.addEventListener("DOMContentLoaded", function () {
      window.__vpvHiStart && window.__vpvHiStart();
    });
    window.__vpvHiStart = start;
    return;
  }
  start();

  function start() {
  window.__vpvHiStart = null;
  if (document.getElementById("vpv-hi")) return;
  // Appended at the END of body, where React's hydration tolerates strangers.
  // (An element in the middle of body, or anywhere in <html>, would be a mismatch.)
  var root = document.createElement("div");
  root.id = "vpv-hi";
  root.setAttribute("data-live", "1");
  document.body.appendChild(root);

  var NS = "http://www.w3.org/2000/svg";
  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ── the name ───────────────────────────────────────────────────────── */

  function readName() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)vpv_hi=([^;]*)/);
      if (!m) return "";
      var v = decodeURIComponent(m[1]).replace(/\s+/g, " ").trim().slice(0, 24);
      return v;
    } catch (e) {
      return "";
    }
  }

  // "aryan" and "ARYAN" both read better as "Aryan"; "McDonald" is left alone.
  function tidy(s) {
    s = s.replace(/[‘’]/g, "'");
    if (s === s.toLowerCase() || s === s.toUpperCase()) {
      s = s.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (_, a, b) {
        return a + b.toUpperCase();
      });
    }
    return s;
  }

  // Letters we can write with the pen. Anything else (a name in Devanagari, say)
  // is shown as ordinary text that fades in, never as a row of missing boxes.
  function writable(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === " ") continue;
      if (!F.g[c]) return false;
    }
    return s.replace(/\s/g, "").length > 0;
  }

  var rawName = readName();
  var name = rawName ? tidy(rawName) : "";
  var nameInk = name && writable(name);

  /* ── layout, in glyph units ─────────────────────────────────────────── */

  function layout(text) {
    var cx = 0;
    var items = [];
    var minY = 1e9;
    var maxY = -1e9;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === " ") {
        cx += F.space;
        continue;
      }
      var g = F.g[ch];
      if (!g) continue;
      // A letter with a hook on its left (j, p) leaves a hole before it: draw it closer.
      if (i > 0 && F.k[ch] && text.charAt(i - 1) !== " ") cx += F.k[ch];
      items.push({ ch: ch, g: g, ox: cx - g.x });
      cx += g.w;
      if (g.y < minY) minY = g.y;
      if (g.y + g.h > maxY) maxY = g.y + g.h;
    }
    return { items: items, w: cx, minY: minY, maxY: maxY };
  }

  var LW = layout("welcome");
  var LN = nameInk ? layout(name) : null;

  var vw = Math.max(280, window.innerWidth || 390);
  var vh = Math.max(360, window.innerHeight || 700);

  // One line on a wide screen, two on a phone.
  var gap = F.space * 1.1;
  var oneLine = !!LN && vw >= 760;
  var S;
  var placeW;
  var placeN;
  var lineH = LW.maxY - LW.minY;

  if (oneLine) {
    var total = LW.w + gap + LN.w;
    S = Math.min(vw * 0.78, 1120) / total;
    var x0 = (vw - total * S) / 2;
    var base = vh * 0.5 - ((LW.minY + LW.maxY) / 2) * S;
    placeW = { x: x0, y: base };
    placeN = { x: x0 + (LW.w + gap) * S, y: base };
  } else {
    S = Math.min(vw * 0.86, 560) / LW.w;
    var Sn = LN ? Math.min(S * 0.95, (vw * 0.86) / LN.w) : 0;
    var hW = lineH * S;
    var hN = LN ? (LN.maxY - LN.minY) * Sn : 0;
    var stack = hW + (LN ? hN * 0.35 : 0) + hN;
    var top = vh * 0.5 - stack / 2;
    placeW = { x: (vw - LW.w * S) / 2, y: top - LW.minY * S };
    if (LN) {
      placeN = {
        x: (vw - LN.w * Sn) / 2,
        y: top + hW + hN * 0.35 - LN.minY * Sn,
        s: Sn,
      };
    }
  }

  /* ── the DOM ────────────────────────────────────────────────────────── */

  var css =
    "#vpv-hi{position:fixed;inset:0;z-index:2147483000;overflow:hidden;touch-action:none;overscroll-behavior:contain;" +
    "-webkit-tap-highlight-color:transparent;cursor:default;opacity:1;" +
    "background:radial-gradient(900px 620px at 14% 10%,rgba(25,184,242,.40),transparent 62%)," +
    "radial-gradient(1000px 720px at 90% 94%,rgba(11,92,255,.66),transparent 64%)," +
    "radial-gradient(720px 520px at 62% 42%,rgba(124,92,255,.20),transparent 70%)," +
    "linear-gradient(160deg,rgba(7,26,64,.97) 0%,rgba(11,42,91,.95) 55%,rgba(10,58,140,.94) 100%);" +
    "-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);" +
    "transition:opacity .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi.vpvhi-out{opacity:0;pointer-events:none}" +
    "#vpv-hi.vpvhi-fast{transition-duration:.22s}" +
    "#vpv-hi svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;overflow:visible;" +
    "transition:transform .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi.vpvhi-out svg,#vpv-hi.vpvhi-out .vpvhi-txt{transform:translateY(-10px) scale(1.025)}" +
    "#vpv-hi .vpvhi-spot{position:absolute;left:0;top:0;width:460px;height:460px;margin:-230px 0 0 -230px;border-radius:50%;" +
    "background:radial-gradient(closest-side,rgba(150,200,255,.17),rgba(150,200,255,.06) 60%,rgba(150,200,255,0));opacity:0;will-change:transform,opacity}" +
    "#vpv-hi .vpvhi-txt{position:absolute;left:0;right:0;text-align:center;color:#fff;opacity:0;" +
    "font:600 clamp(28px,7vw,56px)/1.1 Inter,system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.01em;" +
    "transition:opacity .5s ease,transform .5s cubic-bezier(.22,1,.36,1)}" +
    "#vpv-hi .vpvhi-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}";
  var st = document.createElement("style");
  st.id = "vpv-hi-css";
  st.textContent = css;
  document.head.appendChild(st);

  // The page was covered by a bare CSS rectangle from the first byte (the gate in
  // lib/welcome/gate.ts), so nothing flashed. The real overlay takes over now.
  var cover = document.getElementById("vpv-hi-cover");
  if (cover && cover.parentNode) cover.parentNode.removeChild(cover);

  root.setAttribute("role", "status");
  root.setAttribute("aria-label", name ? "Welcome, " + name : "Welcome");
  root.innerHTML = "";
  var sr = document.createElement("span");
  sr.className = "vpvhi-sr";
  sr.textContent = name ? "Welcome, " + name : "Welcome";
  root.appendChild(sr);

  var spot = document.createElement("div");
  spot.className = "vpvhi-spot";
  root.appendChild(spot);

  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  root.appendChild(svg);

  // The ink runs from white to a cool blue-white across the line: glass, not paper.
  var defs = document.createElementNS(NS, "defs");
  var grad = document.createElementNS(NS, "linearGradient");
  grad.setAttribute("id", "vpvhi-g");
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  grad.setAttribute("x1", String(vw * 0.1));
  grad.setAttribute("x2", String(vw * 0.9));
  grad.setAttribute("y1", "0");
  grad.setAttribute("y2", "0");
  [["0", "#ffffff"], ["0.55", "#e6f0ff"], ["1", "#b9d4ff"]].forEach(function (s) {
    var stop = document.createElementNS(NS, "stop");
    stop.setAttribute("offset", s[0]);
    stop.setAttribute("stop-color", s[1]);
    grad.appendChild(stop);
  });
  defs.appendChild(grad);
  svg.appendChild(defs);

  var penGlow = document.createElementNS(NS, "circle");
  penGlow.setAttribute("r", String(S * 1.7));
  penGlow.setAttribute("fill", "rgba(170,210,255,.38)");
  penGlow.style.opacity = "0";
  var penDot = document.createElementNS(NS, "circle");
  penDot.setAttribute("r", String(S * 0.62));
  penDot.setAttribute("fill", "#fff");
  penDot.style.opacity = "0";

  /* ── strokes: halo, glass body, bright core ─────────────────────────── */

  var strokes = []; // in writing order
  var word = []; // strokes of the word being built

  function pathEl(d, tx, ty, s, mx, my, w, stroke, opacity) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", String(w));
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + s + ") translate(" + mx + "," + -my + ")");
    p.style.opacity = "0";
    p._o = opacity;
    return p;
  }

  function build(L, place, scale) {
    var out = [];
    var tail = []; // i-dots and crossbars: written last, the way a hand does
    L.items.forEach(function (it) {
      it.g.p.forEach(function (sp, k) {
        var late = k > 0 && /[ijtx]/.test(it.ch);
        var tx = place.x + it.ox * scale;
        var ty = place.y;
        var sw = F.sw * 1.02;
        var len = it.g.l[k];
        var halo = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw * 3.2, "rgba(96,165,255,.30)", 1);
        var body = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw, "url(#vpvhi-g)", 0.9);
        var core = pathEl(sp[0], tx, ty, scale, sp[1], sp[2], sw * 0.26, "#ffffff", 1);
        var rec = { els: [halo, body, core], len: len, late: late, lead: body, tx: tx, ty: ty, mx: sp[1], my: sp[2] };
        rec.els.forEach(function (el) {
          el.setAttribute("stroke-dasharray", len + " " + (len + 4));
          el.setAttribute("stroke-dashoffset", String(len + 2));
        });
        (late ? tail : out).push(rec);
      });
    });
    return out.concat(tail);
  }

  var wordW = build(LW, placeW, S);
  var wordN = nameInk ? build(LN, placeN, oneLine ? S : placeN.s) : [];
  var scaleN = oneLine ? S : nameInk ? placeN.s : S;

  // Halos first, so the bright ink of one letter is never covered by the glow of the next.
  [wordW, wordN].forEach(function (wd) {
    wd.forEach(function (r) {
      svg.appendChild(r.els[0]);
    });
  });
  [wordW, wordN].forEach(function (wd) {
    wd.forEach(function (r) {
      svg.appendChild(r.els[1]);
      svg.appendChild(r.els[2]);
    });
  });
  svg.appendChild(penGlow);
  svg.appendChild(penDot);

  // A name we cannot write by hand: plain, premium text under the word.
  var txt = null;
  if (name && !nameInk) {
    txt = document.createElement("div");
    txt.className = "vpvhi-txt";
    txt.textContent = name;
    txt.style.top = Math.round(placeW.y + LW.maxY * S + vh * 0.04) + "px";
    root.appendChild(txt);
  }

  /* ── the timeline ───────────────────────────────────────────────────── */

  var T_START = 140;
  var T_WORD = 850;
  var T_NAME = 560;
  var T_GAP = 110;
  var T_HOLD = 380;
  var T_DOT = 70; // each late stroke (i-dot, t-bar)

  function plan(wd, t0, dur) {
    var main = wd.filter(function (r) {
      return !r.late;
    });
    var late = wd.filter(function (r) {
      return r.late;
    });
    var lateT = late.length * T_DOT;
    var mainT = Math.max(200, dur - lateT);
    var total = main.reduce(function (a, r) {
      return a + r.len;
    }, 0);
    var acc = 0;
    main.forEach(function (r) {
      r.a = acc / total; // share of the word's progress at which this stroke begins
      acc += r.len;
      r.b = acc / total;
    });
    late.forEach(function (r, i) {
      r.t0 = t0 + mainT + i * T_DOT;
      r.t1 = r.t0 + T_DOT;
    });
    return { t0: t0, mainT: mainT, main: main, late: late, end: t0 + mainT + lateT };
  }

  var pW = plan(wordW, T_START, T_WORD);
  var pN = nameInk ? plan(wordN, pW.end + T_GAP, T_NAME) : null;
  var writeEnd = pN ? pN.end : pW.end;
  var exitAt = writeEnd + T_HOLD + (txt ? 500 : 0);

  function ease(t) {
    // easeInOutSine: the pen leaves the paper gently, hurries through the word, settles.
    return 0.5 - Math.cos(Math.PI * t) / 2;
  }

  var t0 = 0;
  var done = false;
  var leaving = false;
  var tipX = vw / 2;
  var tipY = vh / 2;

  function setReveal(r, frac) {
    var off = r.len + 2 - frac * (r.len + 2);
    var show = frac > 0.001;
    for (var i = 0; i < 3; i++) {
      r.els[i].setAttribute("stroke-dashoffset", String(off));
      r.els[i].style.opacity = show ? String(r.els[i]._o) : "0";
    }
  }

  function drawWord(p, now, scale) {
    var t = Math.min(1, Math.max(0, (now - p.t0) / p.mainT));
    var prog = ease(t);
    var tip = null;
    p.main.forEach(function (r) {
      var f = (prog - r.a) / (r.b - r.a);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      setReveal(r, f);
      if (f > 0 && f < 1) tip = { r: r, f: f };
    });
    if (!tip && t >= 1) {
      // between the word and its dots: pen rests at the last stroke's end
      var last = p.main[p.main.length - 1];
      if (last) tip = { r: last, f: 1, rest: true };
    }
    p.late.forEach(function (r) {
      var f = (now - r.t0) / (r.t1 - r.t0);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      setReveal(r, f);
      if (f > 0 && f < 1) tip = { r: r, f: f };
    });
    return tip;
  }

  function movePen(tip, scale) {
    if (!tip) return;
    var r = tip.r;
    var pt;
    try {
      pt = r.lead.getPointAtLength(Math.min(r.len, r.len * tip.f));
    } catch (e) {
      return;
    }
    tipX = r.tx + scale * (pt.x + r.mx);
    tipY = r.ty + scale * (pt.y - r.my);
    penDot.setAttribute("cx", String(tipX));
    penDot.setAttribute("cy", String(tipY));
    penGlow.setAttribute("cx", String(tipX));
    penGlow.setAttribute("cy", String(tipY));
    spot.style.transform = "translate(" + tipX + "px," + tipY + "px)";
  }

  function frame(ts) {
    if (done) return;
    if (!t0) t0 = ts;
    var now = ts - t0;

    var tipW = drawWord(pW, now, S);
    var tipN = pN ? drawWord(pN, now, scaleN) : null;
    var inName = pN && now >= pN.t0;
    var tip = inName ? tipN || tipW : tipW;
    var writing = now >= T_START && now < writeEnd;
    if (writing && tip) movePen(tip, inName ? scaleN : S);
    var show = writing ? "1" : "0";
    penDot.style.opacity = show;
    penGlow.style.opacity = show;
    spot.style.opacity = writing ? "1" : String(Math.max(0, parseFloat(spot.style.opacity || "0") - 0.05));

    if (txt && now >= writeEnd - 100) {
      txt.style.opacity = "1";
    }

    if (now >= exitAt) {
      leave(false);
      return;
    }
    requestAnimationFrame(frame);
  }

  /* ── leaving ────────────────────────────────────────────────────────── */

  var startedAt = Date.now();
  var dismissed = false;

  function emit(skipped) {
    var detail = { skipped: !!skipped, ms: Date.now() - startedAt, ink: !!nameInk, reduced: !!reduce };
    // On a global too, for a tracker that was not listening yet.
    window.__vpvWelcome = detail;
    try {
      window.dispatchEvent(new CustomEvent("vpv:welcome", { detail: detail }));
    } catch (e) {}
  }

  function cleanup() {
    if (dismissed) return;
    dismissed = true;
    try {
      root.parentNode && root.parentNode.removeChild(root);
      st.parentNode && st.parentNode.removeChild(st);
    } catch (e) {}
  }

  function leave(skipped) {
    if (leaving) return;
    leaving = true;
    done = true;
    emit(skipped);
    root.className = (skipped ? "vpvhi-fast " : "") + "vpvhi-out";
    window.removeEventListener("keydown", onKey, true);
    setTimeout(cleanup, skipped ? 260 : 560);
  }

  function onKey(e) {
    var k = e && e.key;
    if (k === "Escape" || k === "Enter" || k === " ") leave(true);
  }
  root.addEventListener("pointerdown", function () {
    leave(true);
  });
  window.addEventListener("keydown", onKey, true);
  // Whatever happens, the page is never held hostage.
  setTimeout(function () {
    leave(false);
  }, 7000);

  try {
    sessionStorage.setItem("vpv_hi_seen", "1");
  } catch (e) {}

  if (reduce) {
    // No movement: the finished words fade in, rest a moment, fade out.
    wordW.concat(wordN).forEach(function (r) {
      setReveal(r, 1);
    });
    if (txt) txt.style.opacity = "1";
    setTimeout(function () {
      leave(false);
    }, 1400);
  } else {
    requestAnimationFrame(frame);
  }
  }
})();
