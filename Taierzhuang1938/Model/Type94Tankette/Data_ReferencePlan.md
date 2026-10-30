# Type 94 Tankette — reference selection and acceptance

## Chosen version

Early running gear, small elevated rear idler. Primary appearance is the actual
Kubinka / Patriot Museum vehicle photographed by Alan Wilson on 25 August 2017.
The solid olive museum repaint, fitted short machine gun and closed hatches in
that photograph define this asset. This does not reconstruct a documented
individual vehicle at Tengxian. Original photographs are in the external
`Type94Tankette/References` source directory; acquisition metadata records hashes,
source URLs and whether the original or a Commons thumbnail was obtained.

Primary: https://commons.wikimedia.org/wiki/File:Type_94_TK_–_Patriot_Museum,_Kubinka_(26474921729).jpg

The 2014 photograph of the same vehicle supplements visible seams, suspension and
rear body structure. Its camouflage paint is a different museum finish and is
not combined with the 2017 repaint. Armor School is a different exhibit and is
not used to override the primary vehicle. Treloar supplements only the basic
rear door / turret hatch mechanism; hidden internals and exact hinge travel are
inferences. Historic late-model side photographs are exclusion references:
their large ground-contact rear idler and extended suspension are not modeled.

The high chamfered box behind the selected Kubinka vehicle is a **separate
trailer**. Its roof, body and running gear are excluded from the tankette shape
comparison. The museum catalogue independently describes the vehicle displayed
with that trailer: https://preservedtanks.com/Profile.aspx?UniqueID=22

## Conflicts and scale anchors

- The Notion page quotes approximate 3.36 × 1.62 × 1.63 m overall dimensions.
  Common early-vehicle data give 3.08 m length; the 1944 US War Department manual
  describes an early configuration at about 10 ft 3 in and an altered trailing
  idler configuration at 11 ft. Wartime model names and calibre identification
  are inconsistent; they are not treated as definitive production designations.
- The original provisional specification JACAR C01001361800 has now been opened.
  Its PDF page 19 lists **3.084 m length, 1.620 m width, 1.620 m height, 0.300 m
  minimum belly clearance and 0.164 m track width**. The record spans July 1934
  to November 1936 and includes period annotated photographs on pages 23-24.
  This directly supports the selected early configuration's scale anchor; it
  does not survey the individual restored museum vehicle or resolve every
  production change behind the generic 3.36 m figure.
- The retained V12 candidate used a 3.08 m nominal length, 1.62 m width and
  1.63 m height from secondary figures. The active gray study uses the primary
  anchor above, with its actual exported bounds recorded separately. Precise
  photo-derived local dimensions remain estimates with no false millimetre
  certainty. No long late chassis is combined with the small early idler.
- Early manual anchors: bogie / rear idler diameter approximately 15 in
  (0.381 m), drive sprocket diameter approximately 21 in (0.5334 m), track pitch
  approximately 3 in (0.0762 m). The exact museum track and wheel dimensions
  must still be checked by the reference camera comparisons.
  The same early-configuration table gives approximately **25 in (0.635 m)
  to the sprocket centre** and explicitly describes a lowered front sprocket
  with the later trailing idler. V13's 0.427 m authored centre was inconsistent
  with that early arrangement and the visible raised nose. These wartime
  intelligence dimensions are approximate: its 5 in track-width figure also
  conflicts with the original Japanese specification, so they are cross-checks,
  not a survey of the Kubinka vehicle.
- The Notion prose says rear engine, but the Australian War Memorial's account
  explicitly places the engine at left front, driver at right front, turret
  toward the rear. The latter layout agrees with the actual photographs and is
  followed here. The asset has one machine gun, never a cannon.

Sources actually opened:

- Australian War Memorial, vehicle description:
  https://www.awm.gov.au/visit/exhibitions/bigthingsinstore/tankette
- US War Department, *Japanese Tanks and Tank Tactics*, Special Series 26,
  15 November 1944, section on tankettes (wartime intelligence, approximate):
  https://ww1.lonesentry.com/manuals/japanese-tanks/tankettes.html
- User's reference page:
  https://app.notion.com/p/40260335331c8122be94e41acca07698
- Jiang Keshi's 2016 study, printed p. 55, also quotes 3.08 m length and
  1.62 m height. Its cited provisional specification has now been inspected
  directly. The battle archives cited by the papers remain a separate,
  unchecked source scope.
  https://ousar.lib.okayama-u.ac.jp/files/public/5/54216/20160528124052424269/scs_015_053_068.pdf
- JACAR original provisional specification, PDF pages 19-24:
  https://www.jacar.archives.go.jp/das/meta/C01001361800

## Acceptance order

1. Neutral-gray shape, primary perspective camera and closed-hatch pose.
   Check silhouette, front plate / fenders, long glacis, driver's asymmetric
   cabin, turret taper / undercut / gun mount, rear body, running gear and tracks.
2. Check rivet rows, hatch seams / hinges / latches, ventilation louvers, wheel
   dishing / openings, track shoe construction and visible fittings.
3. PBR comparison: olive painted steel, restrained localized chips / rust at
   seams and fittings, polished worn track contact, black rubber tyre bands,
   dirt accumulation. Museum lighting is not baked into BaseColor.
4. Actual exported GLB reimport, metric bounds / front -Z / ground origin,
   independent left and right links and wheels, turret yaw, gun pitch and
   evidenced hatches. Check loop closure and wheel speed against track distance.

Every unresolved visible mismatch remains open. Numeric / export checks cannot
prove reference identity. Hidden interior, underside construction, exact paint
pigment, backside details and mechanism clearance are explicitly inferred.

## Current study and evidence

### Current V37 geometry and SurfaceV39 finish candidate

`Data_GrayStudyV37.json` records the observed vent top-sheet overlap and catch
seating correction. All 246 other mesh surfaces are retained. The reference
study `Data_CameraReferenceStudyV37.json` keeps the rejected global hypotheses:
the current upper-point fit reaches a crop boundary and its independent road
wheel contours remain 15-20 pixels away at a 640-pixel image width. Neither that
fit nor the older wheel-plane camera accepts the whole body/cabin/turret shape.
The single-plane cab rectangle shortcut is also rejected. No camera failure is
used as a physical dimension measurement.

SurfaceV39 is a material candidate on V37, including the vent change and a new
zero-rest horizontal gun axis sharing the retained ball centre. The small
demonstrated travel is inferred; the museum's ball-mount description establishes
the broad mechanism, not exact stops. All 247 oriented surfaces are retained.
SurfaceV36 remains a separate checkpoint on V35. The full editable-source/PBR/
reconstructable game-derivative objective remains open, including fresh UV replay.

V38's acquired higher-angle TourGuide photograph is recorded in
`Data_ReferenceSources.json`. It has no EXIF or established capture date. V40 has
now used explicitly named features from it for three-view training, with four
third-view physical checks withheld and one corrected corner retained only as
a post-hoc diagnostic. The whole photograph is no longer an untouched holdout.
The publisher's incorrect Type95 caption is not used as a historical source.
No metric camera or new body reconstruction has been adopted.

`Data_CameraReferenceStudyV40.json` records the free-point, cab-surface,
turret-rigidity and processed-image camera diagnostics. Native review rejects
repeated hinge/stud and tow-fitting optical matches; removing those changes the
fit materially. Photoshop/XMP saves establish image processing but do not prove
a lens or perspective warp. The actual V37 comparison preserves each image's
aspect, including the new 4:3 view, and its renderer agrees with the separate CV
projection calculation. These technical checks do not accept the camera or
whole model. Cab-only analytic changes lower some upper errors while worsening
whole-vehicle controls. Next, establish actual primary/TourGuide lower axle-end
identities or defensible tyre arcs before changing global proportions.

### V41 five-view lower controls and V42 running-gear trial

`Data_CameraReferenceStudyV41.json` supersedes the camera-research checkpoint.
Four named axle-cover identities now link the native 2017/TourGuide views to
the two museum-published 2022 views; their centres retain broad optical
uncertainty. Four creases on the fixed slotted vent panel bridge body and
running gear. Incorrect draft points on spoke webs, the side wall and the
lower sloping vent panel are rejected explicitly.

The free-point five-view fits do not constrain cap collinearity or equal
protrusion. Low residuals and a near-straight reconstructed row still do not
prove Euclidean vehicle axes. A physical-coordinate skeleton separately tests
cab yaw, nominal height and the retained approximate wheel size; these are
regularized hypotheses, not adopted museum dimensions. The old/new whole
fender checks continue to reject complete shape acceptance.

`Data_GrayTrialV42.json` records an actual editable gray component trial from
`Data_RunningGearTrialV42.json`. Only road-wheel longitudinal positions and
lower bell-crank centres change. It retains V37 body/cabin/turret and wheel
sections, with the closed belt recomputed. The first build exposed an integer
count/pitch-radius iteration cycle. Fixed-count candidate solves now propagate
the selected 86 links into construction and correction, without relaxing
clearance assertions. The default V37 path remains exactly equal to its locked
baseline. Source/actual import sweeps pass, but the trial remains separate from
active V37 and SurfaceV39, with whole-photo/PBR/game acceptance false.

Next, solve fender, glacis and nose as one envelope in the same coordinate
problem and inspect full surfaces/tyre outlines. A lower fitting cost or a
component improvement does not accept the complete vehicle.

### Retained V32 geometry, SurfaceV34 study and camera research

The V32 gray identity is `Data_GrayStudyV32.json`; its relative front-fitting,
aperture and conditional roof-hinge changes are in `Data_TurretFrontLayoutV32.json`.
Both unconstrained and structural sensitivity are retained. Neither accepts a
global camera or absolute local dimensions.

Following the user's request for finer metal surfaces and working articulation,
`Data_SurfaceStudyV34.json` records a separate editable PBR study on that geometry.
Thin enamel, cast finish, blued steel, rubber and shoe-contact polish are separated;
small inferred convex-edge wear uses the actual UVs. Whole-shape acceptance,
exact wear placement, full fresh texture replay and the new game derivative remain
open. `Data_MotionReferenceV34.json` records the checked museum and wartime sources
and distinguishes the model's demonstration speeds/stops from historical data.

### Retained V31 local correction and prior camera research

V31 corrects the fixed MG flange to the observed six-site hex-head pattern,
replaces its round black disk with a real ball bore, and adds an inferred front
armor socket. A full-fixed-vehicle sweep exposed the prior -10-degree contact;
the corrected source and actual GLB use zero contact exclusion. The old uncut
armor still blocks the same ball in a counterfactual. Hidden dimensions and
function remain inferred; the other triangular front feature is unaccepted.
Exact files/checks are in `Data_GrayStudyV31.json` and
`Data_MgFlangeReferenceV31.json`.

V29's selected rear-door aperture and static
fittings replace a protruding handle copied from another exhibit. Its concealed
lock is explicitly an engineering demonstration. The rear inner miter is corrected
to an inferred 8 mm plate; the exterior and forward hull are retained. Exact files
and checks are in `Data_GrayStudyV29.json` and `Data_RearDoorFaceLayoutV29.json`.

`Data_CameraReferenceStudyV30.json` records new body-only feature matching between
the 2017 original and museum photographs 2/7. The bounded three-view fit includes
50 three-view and 179 two-view body tracks. The low training residual does not
accept the camera: 17 withheld three-view turret candidates have about 10.2 native
pixels median and 31.8 maximum primary-image residual, and the crop solution
reaches its vertical boundary. Candidate identities and intrinsic sensitivity
remain open; these residuals are not evidence of turret motion.

An authored 428 mm vent-span registration was also rejected. It lacks an
independent metric anchor, assumes an unverified side-wall normal as the vehicle
transverse direction, and produces an inconsistent wall offset and clipped actual
model render. Neither that camera nor the unstable additional front-photo fit is
adopted. The actual 164 mm full-track-width endpoints remain unidentified; repeated
wheel/tread detector matches do not supply this gauge. Raw matches, native crops,
trials and rejections are external in `Acceptance/CameraStudyV30/`. The V30 study's
V29 geometry input and comparison camera remain historical research. Its camera
was not adopted; the current PBR/game checkpoints and completion flags remain.

`Data_CameraReferenceStudyV31.json` distinguishes model-conditioned fits from
independent camera controls. Authored marker locations and dimensions cannot
validate themselves through a camera refit. Continue correcting unambiguous
visible geometry while cross-checking global camera and shape together; do not
make an unverified camera-only fit a permanent prerequisite for every correction.

### Prior V28 gray candidate — inclined rear armor and cargo door

The selected exhibit's rear views support a sloped main rear-door plane. A
relative-camera fit from the main cargo door and trailer wall is checked by
85 held-out detections on the actual turret rear hatch. The central relative
plane estimate is about 18.7 degrees to the observed vent longitudinal line;
moderate conditional point/intrinsic perturbations give roughly 17.6-20.2
at the 5th/95th percentiles. V28 adopts an inferred 19-degree rest pose.
JACAR provisional-specification photographs on PDF pages 23-24 corroborate the
sloped form but do not specify a measured angle for the restored exhibit.

The checked rear door, bearings, latch, keeper and seal move as a rigid
assembly. The original roof rear edge remains an inferred angular anchor.
The rear shell is solidified in its old form before posing its rear ring;
the two upper side sheets change with it, including their bevel strips.
Thin inferred corner armor closes the otherwise open side/back transition.
All 240 other exported mesh surfaces, including all 200 wheel/track meshes,
are conserved. Exact identity and checks are in `Data_GrayStudyV28.json` and
`Data_RearArmorReferenceLayoutV28.json`.

This does not accept the global camera or scale. Initial side-wall detections
misidentified as the turret rear hatch were rejected, along with their
apparently low-error balanced F and bound-hitting crop/intrinsic fits. The
correct rear-hatch region passes independent epipolar checks. Attempts to
join all view groups using repeated ceiling lights or partly occluded hinges
have not produced an accepted common scale. Rear-door circular openings and
attachment patterns also remain to be matched before final PBR/game work.

### Prior V27 gray candidate — curved rear turret hatch

The museum's two rear photographs show a tall curved turret hatch that the
previous recipe omitted. V27 replaces the fake narrow rear strip with a real
opening, a separate curved moving panel and two collinear tilted hinge pins.
The museum catalogue at https://www.awm.gov.au/collection/REL:16287 explicitly
identifies a rear turret hatch on another preserved Type94, corroborating the
component without supplying Kubinka dimensions. The exact rear geometry,
hidden bearing/seal sections, free-edge fitting function and demonstration
limits remain inferred; the relative hatch proportions are still unaccepted.

Actual imported and editable-source checks passed, with all 243 other meshes
and all 200 wheel/track meshes conserved. An unrestricted 120-pose diagnostic
found contact with the closed driver roof at 180-degree turret yaw and
75-degree rear opening. The local controller holds forward yaw while this
door is open; this is a modeled clearance guard, not a historic operating rule.
Details and exact file identities are in `Data_GrayStudyV27.json` and
`Data_TurretRearLayoutV27.json`. Global-camera research remains unaccepted,
including a rejected five-camera scene folded by repeated wheel matches.
No new PBR/game derivative or release is claimed.

### Prior V26 gray candidate — turret cover and hinge proportions

The cover upper edge is partly hidden by its hinge leaves. Coarse four-corner
homographies failed calibrated rectangular orthogonality and gave inconsistent
aspects; they are rejected. Instead, native cover-height ranges are compared
with the adjacent five-row span in both photographs. The previous model's
ratio was about 0.50–0.52, outside both observed ranges. The revised actual
export gives about 0.31 and 0.29 in both fixed diagnostic camera sets, within
the corresponding source ranges. Hinge-axis positions and the primary photo's
moving-leaf cap positions are checked in the same relative coordinates.

V26 reduces the nominal cover height to 76 mm and adjusts its centre, hinge
station, leaf and visible fittings. The first shortened-cover trial retained
an overlong leaf arrangement and was rejected visually despite passing its
structure checks. The final mechanism retains real pins, hollow eyes, body
seats and separate controls. The hidden 45 mm aperture, absolute local dimensions
and opposite-side layout remain inferred. Driver covers retain their surfaces.
All four source covers pass 22 poses against every fixed surface including
seals without contact exclusion; actual-import movement is also checked.

Current identity is `Data_GrayStudyV26.json`, with source observations in
`Data_TurretPortReferenceLayoutV26.json`. The 236 other meshes and all 200
wheel/track meshes retain their surfaces. No global camera or whole-body
proportion change is accepted here. Scale/origin work should use real shoe-width
edges or lower track contact lines as independent constraints; a front-tip span
must not be silently treated as the nominal overall width. PBR, full replay and
the final game derivative remain open.

### Retained V25 gray candidate — measured turret fittings

Native crops confirm the same outer driver-frame corners in both photographs.
They also expose an error in the old turret study: several coarse side-feature
guesses were on blank paint or beside their caps. Those points cannot establish
relative turret rotation. Twelve remeasured physical features and source hashes
are retained in `Data_TurretReferencePointsV25.json`. The no-yaw Sampson RMS is
about 0.35 pixels at 640 width; a free-yaw improvement remains within marker and
body-camera uncertainty. Neither turret pose nor global calibration is accepted.

The side strip has two columns of five rivets, with almost equal vertical
intervals. The old four-row dedicated strip, generic upper pair and extra generic
column overlapped into fourteen caps per side. V25 removes those overlaps and
provides ten caps per side on five rows. Absolute endpoint heights and column
stations remain author estimates; the opposite pattern is explicitly inferred.
Each foot seats on the actual faceted cone. The cone itself, all other details
outside those cap components, 244 other meshes and all 200 wheel/track meshes
retain their surfaces. Current exact identity is `Data_GrayStudyV25.json`.

The corrected rows also expose a remaining side-cover height/placement mismatch.
Its rectangle and lower fasteners require remeasurement before changing that
shape. Global scale/origin still needs true extremity or track-contact evidence;
the unsurveyed front-tip span cannot be silently equated to nominal overall
width. Current primary cameras, whole-body proportions and V12 game/PBR remain
unchanged. Crops, rejected coarse points, conditional trials and actual local
viewer evidence remain external in `Acceptance/CameraStudyV25/`.

### Retained V24 gray candidate — full driver-cover contact coverage

The previous driver-cover body sweep excluded the hinge neighborhood and dark
seals. A new complete-surface diagnostic found 38 source polygon contacts
between the closed visor and its hidden seal; the actual exported faces were
coincident to about 0.1 micrometre. V24 moves only that hidden frame inward by
an explicitly inferred 0.3 mm. The visor's outside surface and the other 244
meshes, including all 200 wheel/track meshes, retain their actual surfaces and
triangle counts. No photographic shape or camera parameter changes here.

Both driver covers pass 29 source poses, with extra samples near closing, and
22 actual-import poses against every fixed surface including seals, with zero
contact exclusion. The fixed-pin and combined-cover checks also remain active.
The actual source was freshly reopened and the UI was exercised closed/open.
Current identity is `Data_GrayStudyV24.json`; the V23 failed diagnostic is kept
as regression evidence. Whole proportions/camera, remaining visible fittings,
PBR/replay, final game derivation and release reconciliation remain open.

### Retained V23 gray candidate — opposite-front evidence and right driver port

Game*Spark's June 2017 report supplies an independent opposite-front photograph
of the olive museum display. It confirms the previously missing right driver
side cover. V23 adds an actual wall opening and a separate moving cover with
fixed pins, hollow eyes and body-seated feet. The left cover supplies its nominal
mirrored layout; the small photograph does not establish exact dimensions,
fastener positions, concealed sections or historical travel limits.

All four side covers are checked in 22 source and actual-import poses against
the full fixed surfaces including seals, with zero contact exclusion. Nine rays
check the new wall aperture and four more check the surrounding retained steel.
All 241 old meshes outside the cut hull and all 200 wheel/track meshes retain
their surfaces. The new control is required when the hull declares its presence;
older assets retain the original eight controls. Current exact identity and
checks are in `Data_GrayStudyV23.json`. The new gray file still fails full PBR
gates, as expected, and has not replaced the retained V12 game checkpoint.

The official museum catalogue provides six 1440×960 photographs with camera,
date, lens and 25–48 mm focal metadata. A seventh banner is a derivative/crop.
These are publisher files, not established camera originals. After the metadata
resize error was corrected, masked fixed-focal SfM still yielded disconnected
2+7 and 3+4 pairs. Ceiling-beam matches and unbounded focal/radial refinement
were rejected. No six-view or metric reconstruction is accepted. The three-view
2017/2014/independent-photo trial also depends on an assumed fender-tip gauge
and authored height/longitudinal registration; it cannot survey body or wheel
stations. V19 comparison cameras remain unchanged and unaccepted.

New photographs establish no change to the selected 2017 olive repaint or short
machine gun. The neighboring vehicle's long barrel, separate trailer geometry
and blue exhibition lighting are excluded. Acquisition, EXIF, failed trials and
partial reconstructions are archived externally in `Acceptance/CameraStudyV23/`.
The existing history/creation entry still describes a museum-reference local
candidate with inferred hidden details and no confirmed city-assault deployment.

New publisher sources:

- https://www.gamespark.jp/article/2017/06/02/73766_2.html
- https://parkpatriot.ru/o-parke/tekhnika-parka/malyy-tank-tekey-tip-94/
- Canon sensor specification, focal initialization only:
  https://sg.canon/en/support/6200124200

### Retained V22 gray candidate — rear door and staged latch release

Supplementary rear photographs corroborate two vertical hinges, a two-fastener
fixed leaf, a moving door leaf and an opposite-edge handle/keeper. V22 supplies
separate pins and hollow annular eyes, a body-seated rigid frame and supports,
and an independently turning spindle/cam with a real door bore. The nominal
sections, local positions, clearances and demonstrated release range are
inferred. These images do not establish the partly hidden selected Kubinka
door's aperture or marking pattern; those details remain unresolved.

The controller releases the handle before opening the door, then reverses the
sequence on closing. Actual geometry is checked through 19 latch poses and
21 door poses with zero contact exclusion, including the seal. Counterfactual
locked-door start poses must meet the physical keeper, proving that release
has a geometric purpose. The closed outer outline, plane and thickness are
retained; 235 other meshes and all 200 wheel/track meshes retain their surfaces.
Current identity is `Data_GrayStudyV22.json`. Local rear-detail views explicitly
label Treloar as shared-type mechanism evidence, not primary shape acceptance.
Whole-vehicle calibration, remaining visible detail, driver-cover/body contact
coverage, PBR and final game derivation remain open.

### Retained V21 gray candidate — three side-port interfaces

The original closed covers show two lower caps and separate hinge-leaf bolts,
rather than the former generic corner-screw pattern. V21 follows that visible
count and gives all three covers independent pins, annular eyes and leaves.
The driver feet meet its flat side wall; turret feet and backing frames follow
the actual curved shell. Their concealed sections and exact dimensions remain
inferred. The opposite turret side shares the visible-side pattern by inference.
The small edge rod's function is unverified; no locking action is invented.

Each actual exported cover is swept against the complete fixed geometry and
seal in 22 poses with zero contact-zone exclusion. Browser rays independently
check that the lower caps and edge fitting project above the outside lid face.
An initial back-face-fitting trial was rejected by visual review and replaced;
counts alone are insufficient. All three closed lid surfaces, 226 other meshes
and all 200 wheel/track meshes are retained. Turret changes are confined to the
local side-port cut regions. Camera, overall proportions, PBR and final game
derivation remain unaccepted. Current identity is `Data_GrayStudyV21.json`;
local evidence is external in `Acceptance/Data_SidePortEvidenceV21.json`.

### Retained V20 gray candidate — commander-hatch rigid interface

V20 replaces the generic commander-hatch knuckles with separate stationary
pins/fork eyes and moving annular eyes/leaves. Four fixed feet seat on the
actual turret roof. The lid's forward chord, aperture and seal are coupled to
the real interface; its curved rear outline, thickness and lift handle remain.
The concealed bearing section, local clearances and tested travel are inferred.
The complete fixed surface sweep includes the dark seal with no contact-zone
exclusion. The actual export retains all 232 other mesh surfaces and triangle
counts, including all 200 wheel/track meshes.

Camera/body alignment remains unresolved. Drive-face and body-pitch trials can
move the roof toward the image but do not reconcile the cabin, nose cowl and
continuous deck depth. Those alternatives remain unaccepted diagnostics and
do not drive model geometry or replace the V19 comparison cameras. Native
crops support the cabin-base seam identity but establish no extra step or
absolute height. Current identity, evidence and remaining work are recorded in
`Data_GrayStudyV20.json`; the research archive is external in
`Acceptance/CameraStudyV20/`.

### Retained V19 gray candidate — nose and driver-front layout

V19 revises the front armor coordinates and couples the long deck, side cheeks,
tow fitting and placard to that surface. The nose cowl's visible rear corner
contradicts the former shallow-rear estimate. Its raised rear roof, broader
front radii and two surface-mounted fasteners now agree much more closely in
the same two fixed diagnostic views. Their cap-centre errors are about 0.6-2 px
at 640 width, and the rear virtual corner is about 1 px. These are local
comparisons in estimated cameras, not independent proof of global dimensions.
Hidden rear skirt, exact radii and gauge registration remain inferred.

The driver front was tapered in the former model, whereas the two-photo study
is closer to an equal-width frame. V19 updates that frame and its side port,
then authors the cover, fine slit and visible fittings from normalized primary
photo observations. Unsupported generic near-side rivet rows are removed.
`Data_DriverReferenceLayoutV19.json` holds the relative controls and their scope.
The seal and cover have real surface contact. Only the fine outside sight mouth
is observed; its inward splay and hidden aperture bounds are inferred. Actual
normal, horizontal and reference-camera rays pass through the closed assembly.

The V19 GLB passes 553 raw checks, 44 browser checks and 25 native movement
checks, plus a separate editable-source reopen audit. All 200 wheel/track mesh
geometries retain their actual V18 world vertices. The raw front probe follows
the authored front coordinate while retaining its actual ray/normal/winding
assertion; the old V12 export still passes the full verifier. Current identity
and limits belong to `Data_GrayStudyV19.json`.

The local page now defaults to the current two-photo estimated main view and
labels it unaccepted. Its front-plane detail view is rebuilt from the current
GLB, so an older cabin-frame normalization cannot silently serve a new shape.
This comparison only covers coplanar details. The native source reference camera
is still a legacy diagnostic; whole-vehicle camera, front-body outline, upper
body/turret placement, materials and game derivation remain open.

New observations, rejected wheel-shoulder fits and radial-lens diagnostics are
external in `Acceptance/CameraStudyV19/`. No wheel-station change is derived
from those rejected fits.

### Retained V18 gray study — rear longitudinal engine-cover lift

The two same-vehicle originals put the engine-cover lift near its rear edge,
with its feet mainly fore/aft. The former front transverse handle contradicted
both views. V18 moves and reorients that lift and adds the three visible front
flange fasteners. Relative handle position and foot separation were compared
in units of hinge separation, so this comparison does not adopt the uncertain
whole-vehicle metric scale. Exact rod dimensions, mounting offset and small
skew remain photo estimates.

The actual export retains all 224 closed-lid vertices and the other 233 existing
mesh geometries exactly. Its handle feet are inside the lid and seat into its
surface; the three new fixed fasteners meet the real deck plane. The new export
passes 552 raw checks, 41 browser checks, 25 native movement checks and a
separate editable-source reopen audit. Current identity and limits are in
`Data_GrayStudyV18.json`. This is still untextured gray, with no game-budget or
strict whole-reference acceptance.

Seven physical engine-plane correspondences were added to the two-photo study.
The optional planar fit remains sensitive to foot/plate height assumptions;
allowing a raised foot and imposing a near-plane foot give different estimates.
The held-out far fender still has roughly 2-3 pixels of reprojection residual
at 640 width. A smaller inferred fender asymmetry alone does not establish
calibration. The main camera and global body dimensions are unchanged; raw
observations and these diagnostics are external in `Acceptance/CameraStudyV18/`.

### Retained V17 gray study — longitudinal engine-cover hinges

Both same-vehicle originals show the two engine inspection-cover knuckles along
its outer side edge. V17 removes the unsupported rear transverse hinge row and
uses that inclined longitudinal axis. The seated lid and handle are retained;
the actual exported old vertices move by at most 0.000154 mm. Separate fixed
pins/fork eyes and moving annular eyes/leaves provide a real rigid interface.
Their hidden section, nominal clearance and demonstrated opening limit remain
inferred. The engine interior remains simplified inferred space.

The browser composes the local opening rotation after the authored rest
quaternion. Native checks use the same composition and test the engine lid
against its pins and the full rigid body with no hinge-contact exclusion.
The exact V17 export passes 549 raw checks, 41 browser checks and 25 native
motion checks; its editable source was reopened separately. V12's 689 browser
checks still pass with the new controller. These do not accept PBR or reference
matching. Current identity and scope are in `Data_GrayStudyV17.json`.

The two-photo camera study recovered the 2014 original's explicit Camera Raw
crop. Its predicted native dimensions agree with the delivered JPEG to within
one pixel. The corrected virtual lens focal length and principal point remain
conditional. The 2017 crop is not retained in its XMP. Three actual front-row
rivet centres were remeasured on native crops; a tow-bracket fitting was removed
from an earlier regular-grid assumption. The revised bundle and held-out fender
tests are promising, but pixel perturbations still materially change estimated
scale and camera parameters. No global body geometry or primary camera was
changed from them. Rejected tyre-conic station estimates remain rejected.

Only local diagnostic camera presets were added for both photographs. Raw
observations, superseded fits, window-vertical checks and sensitivity results
are external in `Acceptance/CameraStudyV17/`.

### Retained V16 gray study — forward-opening driver roof

The open-roof Shuri photograph and the master's front hinge row resolve the
larger outer fittings as the driver-roof hinges. A secondary 2023 description
also explicitly describes a driver upper hatch opening toward the vehicle
front: https://senseki.jp/weapon-tank94typetankette/
The photograph supplements the common roof mechanism; its damage, paint and
running gear do not replace the Kubinka master.

V16 removes the unsupported rear roof hinges and reanchors the roof at the
front row. The original closed lid and handle vertices are preserved to within
one micrometre in the actual exports. Fixed pins and fork eyes remain separate
from the lid's moving annular bearings and rearward leaves. Their concealed
section and clearances remain inferred. No separate ninth front-panel cover is
invented from the outer fittings.

The exported opening direction is consumed by both the browser controller and
native sweeps, with the former rear-hinged exports retaining their own fallback.
Both driver hinge assemblies receive contact-unexcluded sweeps, and the roof /
visor pair receives 25 combined poses. The existing viewer turret interlock and
demonstration stops remain reconstruction constraints, not historical controls.
Current identity and results belong to `Data_GrayStudyV16.json`.

### Retained V15 gray study — central driver visor and its two hinges

The master photograph's central visor flap is much narrower than the V14
panel. Its short lower sight slit, four lower fasteners and two small central
hinges are also distinct from the larger outer frame fittings. The ArmorSchool
photograph shows the central flap open and corroborates that part ownership;
its whole hull, finish and dimensions do not replace the Kubinka master.

V15 rebuilds that flap, aperture, slit and fastening pattern. The small pins
remain fixed in a separate assembly while the annular bearings and leaves move
with the cover. Their hidden fork section and nominal clearance are inferred.
The larger outer fittings retain their observed closed shape; their unobserved
function and travel are not claimed as established mechanisms.

A local comparison rectifies only the master's front cabin plane against four
frame corners. This exposes relative panel and fitting proportions without
promoting another uncertain whole-vehicle camera. The existing frame is the
normalization boundary: this view does not prove its absolute width, slope or
the overall vehicle proportions. PBR remains unaccepted.

An earlier thin Boolean mask produced a solid cap across the opening and was
rejected. The front panel and seal now use explicit annular frame geometry.
The actual pins and bearing eyes receive a dedicated sweep with no contact-zone
exclusion in addition to the existing body/cover sweeps. Exact current identity
and validation belong to `Data_GrayStudyV15.json`.

### Retained V14 gray study — early high nose, photographic acceptance pending

V14 corrects the early high front sprocket and rebuilds its belt loop, fixed
casings, front armour, glacis and mudguards together. The authored sprocket
centre is 0.605 m and the front armour spans 0.560-0.860 m before ground-origin
compensation. These local dimensions remain **photo-derived estimates**; the
0.635 m wartime approximate figure corroborates the arrangement, not the exact
chosen height. Front armour inclination is retained while its height changes.

The 164 mm shoes retain centre planes at X +/-0.684 m and the existing coherent
wheel/arm section. A trial widening to +/-0.728 m was rejected by the new
road-wheel sweeps: rims intersected the fixed arms. The original overall width
does not establish the track centre spacing. The controller now preserves the
imported lateral position; widened-trial camera fits remain rejected diagnostics.
Engine cover geometry, opening, hinge and forward clearance correction use the
new deck plane together. Actual exported cover, belt and wheel sweeps passed,
including all eight road wheels; exact-file results remain separate from
photographic acceptance. The front mudguard root flange and support sections
are inferred construction.

The two-photo SIFT experiment was rejected: repeated wheels and rivets produced
false matches after repainting. Manually sampled tyre conics provide a useful
independent diagnostic, but partly occluded boundaries and current wheel spacing
still limit calibration. Joint camera fits do not yet establish the primary
camera or validate every local proportion. No new fit has been accepted solely
for reducing its numeric residual.

Checkpoint identity and exact-file check results are recorded in
`Data_GrayStudyV14.json`. The V12 packed PBR/game file remains a separate retained
checkpoint; V14 is untextured and does not accept PBR, game budget or strict
photographic matching.

### Retained V13 gray study — not a new PBR/game acceptance

V13 removes the trailer-derived raised rear volume and duplicate internal side
boxes. It restores a short, flat main rear hull, an exposed drawbar frame and a
coherent rear door opening/pivot. The rear wall position, door dimensions and
concealed drawbar details remain reconstruction estimates, informed by the
primary boundary and same-type rear photographs.

It also shortens the front mudguard overhang, mounts nose fittings and the
museum placard on the actual armour surface, and gives the front tow shackle
its own pin, bearing eyes and motion node. Its 0-80 degree demonstration range
is inferred, not a measured service stop. A curved rear-side fitting follows the
visible outline; its precise function and hidden mounting remain unconfirmed.

The original full shoe section was 200 mm wide. V13 constrains the complete
section to the primary specification's 164 mm and adjusts sprocket tooth rows
axially without changing pitch, tooth count or wheel centres. That removes the
actual body/belt overlap found by the expanded clearance test. Concealed drawbar
extension remains inferred while retaining the early nominal length envelope.

That **untextured high-source** checkpoint is 453,506 triangles / 229 mesh nodes,
SHA-256 `850eb253c6142005efb35a48676856bc63675721b8d343518462ec1527ba5099`.
Its bounds are approximately 1.628 x 1.630 x 3.081 m (width, height, length).
Raw geometry checks, 32 browser geometry/motion checks and native motion sweeps
passed for that exact file. Body and fenders are included in belt clearance;
the tow-ring check excludes only the 25 mm pin-bearing contact region.
These results **do not accept PBR, game LOD or strict photographic matching**.
The V12 packed PBR/game file remains the retained technical checkpoint.

Corrected running-gear observations and EXIF-lens trials remain diagnostic:
gear-only fits did not also align the cabin and gun. No new camera calibration
has been promoted. The default comparison view is still approximate.

### V12 drive housings, open wheel webs and recipe replay

The selected original shows rounded stationary casings at the front plate's
corners. V12 adds those cheeks and their forward retaining details. Their local
section, lower cut and hidden attachment are inferred; an approximately 0.22 m
outer radius was refined within that estimate to clear the actual exported belt.
The first larger estimate intersected the belt and was rejected. The housings
belong to the hull, while sprockets and links remain independent moving parts.
The broad flat drive/idler wheel sectors were also replaced by eight narrow
cast ribs. Wheel diameters, centres, sprocket teeth and track pitch are retained.

The high source is 453,048 triangles. The current game GLB is 79,848 triangles /
228 mesh nodes, SHA-256
`462763ad94604bc5ea84c64c12b987ec99e210d400d8cfc0fcbead23447436f3`.
The maximum sampled high-to-game error is below 2.45 mm and reverse error below
2.31 mm. Both are measured against the high export's actual triangulation, under
the unchanged 3 mm bound. Native reimport, raw checks and 686 browser checks
passed. The fixed housings clear 32 sprocket poses and 16 complete-belt phase
samples per side; the eight covers, turret and gun sweeps also passed.

A fresh factory-startup geometry replay now matches all 228 canonical meshes.
The check preserves oriented authored polygons, records tessellation differences
and uses float64 surface samples where necessary. It exposed return-roller bolt
thickness and seal/proxy differences, which were synchronized before validation.
The replay scripts are delivered with the asset; reports and working scenes stay
external. **This is geometry replay, not a completed full PBR texture replay.**
The primary camera, whole-vehicle proportions and observed wear placement still
need matching before strict acceptance can pass.

### V11 projecting engine-side vent shroud

The primary original's close crop shows a projecting box, with a sloping top
hood, two end walls, three recessed slots, a lower flared apron and two top
catches. The previous flat plate and three strips did not reproduce that volume.
V11 replaces it with a separate assembly following those visible features.
Slot heights, projection, apron bend and catch dimensions remain local estimates.
The catches are authored closed; their hidden attachments and operating travel
are not established from the photograph.

The current editable high export is 447,352 triangles. The game derivative is
79,837 triangles / 226 mesh nodes. The painted shroud's measured reduction error
is below 0.54 mm in both sampled directions, under the unchanged 3 mm limit.
An actual GLB ray-depth scan detects three separate openings behind the rails.
Raw checks, 674 browser checks, Blender reimport and the existing BVH sweeps all
passed for SHA-256
`38ac4d9a6d7cf335425912d8919d7b6816c928a6a8d1ed24120a92cdee9a8241`.
The packed Base / Normal / ORM maps and the actual PBR shroud were inspected.
V10's editable high source remains in the external `Versions` directory.

The silhouette overlay is still diagnostic. It shows offsets around the turret,
front track and rear body that cannot yet be separated confidently into camera
and geometry errors. A newly inspected far-front crop also shows a rounded
final-drive side casing, a retaining joint and fasteners at the plate's corner;
the V11 lower-hull corner remained faceted. That observation prompted V12.
Whole-image camera/proportion and visible paint-wear matching remain open; no
strict-match claim follows from the technical results above.

### V10 road-wheel and suspension correction

The Kubinka running-gear crop shows narrow cast ribs, flared rib ends, a dished
hub transition and a broad metal rim inside the rubber tyre. V10 replaces the
former broad flat sectors on all eight road wheels with that construction.
The 0.381 m nominal outer diameter, tyre profile and wheel axes are retained;
rib widths, flare and dish depth remain photo-derived estimates. Four upper
bell-crank rods now reach the ends of the horizontal spring housing rather than
ending in space. Both changes are in the reproducible build script.

The editable high export is 443,188 triangles. The game derivative is 79,507
triangles / 224 mesh nodes, with the wheel-face reduction measured against the
high source under the unchanged 3 mm bidirectional surface-distance bound.
Raw GLB checks, 669 browser mechanism checks, actual Blender reimport and the
cover / turret / gun BVH sweeps all passed for SHA-256
`1bf050cfbaf65ef6b88fdcb330dd83bc1c748e8a73524c75d3fceb785e827ed1`.
These technical results do not establish reference identity.

The camera landmarks were also reviewed against enlarged crops. The previous
drive-wheel and first-road-wheel image coordinates did not identify the journal
centres reliably. Revised manual correspondences and fixed-lens fits are kept
as local diagnostics, not promoted as calibration. The photograph retains a
6000 x 4000 camera-size EXIF tag but is delivered as 4854 x 3236; Photoshop is
recorded in EXIF. Crop, resampling and possible image corrections have not been
established. An effective focal length cannot be inferred from those tags alone.
No geometry was changed merely to reduce the fit residual.

### V9 nose-housing correction

The primary original's front crop shows a tall vertical skirt, a shallow top
which meets the deck toward the rear, broad rounded front corners and an almost
straight rear edge. The former constant-thickness rounded plate did not reproduce
that structure. V9 replaces it with a closed wedge housing, front rise estimated
at 0.140 m and rear rise 0.012 m above the glacis. These local dimensions are
image-derived estimates. The front lift and two observable front fasteners are
retained; unsupported rear hinges have been removed. The preceding V8 high PBR
source is preserved in the external `Versions` directory.

EXIF reports 22 mm actual focal length / 33 mm 35-mm equivalent. Fixed-lens
trials at 33 mm and a possible crop-adjusted 40.79 mm did not improve the current
manual-landmark fit (about 16.8 px and 13.2 px RMS respectively at 640 px, versus
11.9 px for the previous unconstrained estimate). They are diagnostic trials,
not accepted camera calibration. Better correspondence data are still required;
no proportions were altered merely to make these fits pass.

The Australian War Memorial's nine public catalogue screen images were also
acquired as supplemental evidence (REL/16287, serial 88). Its current large rear
idler differs from the chosen Kubinka vehicle. Its interiors, paint and complete
running gear therefore do not override the master reference; shared wheel details
must also be checked against the Kubinka closeups before adoption. Public screen
copies are retained locally, not represented as purchased original-resolution
photographs: https://www.awm.gov.au/collection/REL:16287

The editable high source is `Scene_Type94TanketteHighPbrStudy.blend` in the
external source directory. Development gray scenes are historical snapshots.
The current source has rigid individual links, all wheel pivots, turret yaw,
inner machine-gun ball pitch with a fixed bolted socket, and eight separate
covers. The commander lid has the front chord visible in the open-lid reference;
closed-world geometry is retained when hinge axes are aligned with their pins.
The inspection covers and observation ports have actual apertures and thin inner
walls. Handles and latches belong to their respective moving covers.

The engine and crew interiors are **simplified inferred space**, not researched
equipment reconstructions. Travel stops, small hidden mounting details, exact
paint pigment, individual paint chips and corrosion patterns remain inferred.
The physical shader families distinguish enamel, blued steel, track contact
metal and rubber. Their procedural surface fields are baked to Base / Normal /
ORM; they do not constitute proof of exact photographic wear placement.

All twelve linked Commons originals have now been downloaded and verified.
Notion's Kubinka filename required resolving the actual en-dash title, and the
Shuri filename required its Flickr-number suffix. Acquisition metadata contains
the resolved source page, actual original dimensions and SHA-256 for each image.

## Current status

**In progress. Strict reference acceptance has not passed.** The local candidate
must not be described as proven photographically identical or as a vehicle
documented inside Tengxian. Raw GLB channel, hierarchy and movement checks are
separate technical evidence and do not replace reference matching.

Still required: refine the primary camera/proportions against reliable image
landmarks; inspect remaining visible local shape differences; align observable
surface wear with the primary image; audit the final exported moving model; and
run a complete final PBR recipe replay after the shape has settled.
The asset's scoped history/creation entries have been added to both Notion pages
and the local codex, with font and browser checks passed. They remain unpublished
with this candidate. No gameplay vehicle replacement is part of this isolated
asset task.

## Historical boundary checked for this asset

Jiang Keshi's 2015 study, printed pp. 50-51, discusses the two light-armoured
companies and distinguishes the 63rd Regiment's fighting around Tengxian from
the 10th Regiment's city assault. It reports no record of tanks or armoured cars
in the latter. This is a secondary study citing Japanese records; its original
JACAR scans have not been checked here. Its generic 3.36 m vehicle length is
recorded as a source conflict, not silently applied to this early museum vehicle.
Neither the paper nor the museum photos identify this particular vehicle as
having taken part in the city assault.

https://ousar.lib.okayama-u.ac.jp/files/public/5/53301/20160528122710481090/scs_014_047_070.pdf

## Surface and movement review, 2026-10-25

ShapeV35 corrects the local side-cover/paired-rivet sector while retaining the
unaccepted cone and global scale. SurfaceV36 adds more readable enamel and cast
microfinish, blued-steel directionality, polished track lands and broken metric
edge wear. Exact paint and wear placement remain artistic estimates. The V34 UV
checkpoint is an explicit hashed dependency; this is not a full fresh replay.

The Australian War Memorial description was reopened and supports the left-front
engine, right driver, rear turret and ball-mounted Type 91 machine gun. The
Notion reference page's rear-engine wording was corrected. The 1944 US technical
manual supports front sprocket drive and circumferential turret traverse, but its
mixed early/late naming and specifications do not establish this early museum
vehicle's exact stops, calibre or motion rates. The retained gun limits and demo
speeds remain inferred. The Notion ledger, parent and local codex use that boundary.

https://www.awm.gov.au/visit/exhibitions/bigthingsinstore/tankette

https://ww1.lonesentry.com/manuals/japanese-tanks/tankettes.html

The final local SurfaceV36 GLB, editable source reopen, actual imported sweeps,
browser controls and Cycles close-ups were checked against their recorded hashes.
This stage does not replace the gameplay model or accept the whole photograph.

## Complete construction trial V53, 2026-10-27

The saved V52 envelope hypothesis is now a complete editable vehicle, recorded in
`Data_GrayTrialV53.json`. Its actual length/width/height are
3.083918/1.620054/1.617947 m. The original metric gate passes; the numerical solver
did not converge and the four-view whole-reference match remains unaccepted.

The drive fit maps to a working-radius target rather than a bare rim. Forebody
deck segments, the cabin junction and fender supports are explicit inferred
construction. Actual circulating shoe corners required an 11.5 mm rise at the
front fender controls, so their optical-position constraint remains unresolved.
The side vent and wheel/cap profiles also retain visible differences.

The exact current GLB and source reopen, complete motion, all wheel/belt solids,
real apertures, browser controls and cold replay were verified. Baseline V37 and
V51 exports and the new cold export are byte-identical to their respective
retained files. A grid-grouping self-comparison diagnostic is retained separately
from the stronger exact-byte and ordered-geometry proof.

The Australian War Memorial ball-mount description and the wartime manual were
reopened for the movement request. Broad articulation remains supported; exact
gun stops, the model's 12-degree open-driver-roof pose and operating speeds remain
inferred. SurfaceV44 is retained. Final fresh PBR and the below-80k/3mm game
derivative still follow whole-shape alignment; nothing is published or integrated.

## Forebody side construction V54, 2026-10-28

`Data_GrayTrialV54.json` records the actual replacement of the warped V53 side
face by planar connected armor sections. Exported plane/gauge and closed-topology
checks pass; all other 236 mesh surfaces, 292 node poses/control records and the
track path are exactly conserved. New body/belt contacts were retested. Full
reference alignment and final material/game-derivative acceptance remain open.

`Data_VentProjectionStudyV54.json` exposes a large remaining vent displacement in
the retained conditional camera family. Actual authored crease corners miss the
primary image by about 257 native pixels on average. Free 3D corner fits are not a
complete manufacturable shroud. A new hood-root point remains a draft; reconstruct
the face, hood, apron and hull/fender interfaces from reviewed multi-view evidence
before changing the full part. Preserve real slots and round catch pins. Nothing
in this diagnostic establishes a surveyed plane or an accepted global camera.

## Slat/shroud trial and textured preview V55/V56, 2026-10-28

V55 reconstructs the reviewed slat-face creases and apron support lines as real
geometry. Draft hood/apron endpoints that failed corroborating views are retained
as rejected data. Rear-root depth, the backing, sheet sections and coupled
engine-side/fender attachments remain inferred. Actual exported slat creases fit
the retained conditional cameras substantially better; whole-reference and camera
acceptance remain open.

V56 supplies the requested visible material/texture preview on that geometry:
fresh UVs, twelve complete PBR maps, actual packed-GLB rendering and independent
movement. All 237 surfaces and 292 node poses/control records are exactly
preserved through texturing. The preview is local and does not replace the game
asset. Final source re-open/reimport, cold replay, full alignment and the new
below-80k/3mm derivative remain required. User-directed Goal control counts this
preview turn as round1, permits two further rounds, then pauses the original goal.

## Final source and construction replay V57, round2 of3

The actual final V56 packed source was reopened, re-exported and independently
imported. Exact surfaces, twelve decoded image pixel sets and material bindings
are preserved. Matched source/import studio renders were inspected. Two tangent
entries show small exporter rounding differences; this is recorded separately
from unchanged positions, normals, UVs and indices.

Factory-started V37, V54 and V55 geometry/mechanism outputs are byte-identical to
their retained files. This verifies the construction recipe, not another complete
fresh UV/PBR bake. Whole-reference alignment and the new below-80k/3mm derivative
remain open. One further user-authorized goal round remains before pausing.

## Resumed game and reference audit, V58–V60

The requested three-round pause was completed at V58. A subsequent continuation
resumed the original objective. V59 now provides a below-80k technical geometry
derivative with continuous-distance and articulation checks; final low-surface
PBR and whole-reference acceptance remain open. See `Data_GameTrialV59.json`.

`Data_ReferenceAuditV60.json` verifies actual exported features, projection
conventions, lens-aware display and surface visibility without changing the
retained camera values or native observations. Hidden rotating-hub centres are
not the established counterparts of the old axle-cover optical picks; their
pixel separation must not be used to move mechanical axes. The local five-view
comparison is a checked inspection tool, not a new physical calibration.

Continue the visible cast-arm channel/rim shape from official photos 2/7 while
preserving axes and track layout. Use defensible visible tyre arcs and actual
stationary cover surfaces for the remaining joint camera/shape review. Do not
make a unique camera calibration a permanent prerequisite for every unambiguous
detail correction, and do not accept the whole reference from training errors.

## Visible suspension construction V61

`Data_GrayTrialV61.json` records closed recessed arm sections and rounded pivot
covers from the visible official-photo profiles. Exact section gauges and the
unseen back remain reconstruction inputs. Mechanical axes, all other surfaces,
control poses and track path are conserved. Actual rotation clearance, section
rays, source/export identity and the legacy V55 cold replay were checked.

The local comparison keeps the original reference pixels and retained camera
family fixed while switching V55/V61. The saved-source Cycles close-up is a
separate lighting/profile check. Whole visible-reference alignment, final PBR
and a game derivative of the final accepted revision are still required; the
retained V59 derivative is not silently promoted to that role.

## Moving MG front and barrel V63

`Data_GrayTrialV63.json` records a smaller circular front face, a rounded
shoulder and a barrel group lowered relative to that face. Native 2017 boundary
picks distinguish the dark front face from its reflective shoulder; the 2014
same-exhibit crop corroborates the below-centre barrel arrangement. The 76 mm
face radius, 16 mm additional offset and axial shoulder curve are reconstruction
parameters. No hidden notch or new function is asserted.

`Script_Type94GunFrontTrial.py` reconstructs the new front, then preserves the
hashed V61 editable source and replaces only its moving paint component. The
existing barrel, collars, muzzle, bore backing and front sight translate
together. Their original triangulation is retained before translation. The
remaining 234 mesh surfaces, 292 rest poses/control contracts, mechanical axes
and belt path are conserved. The original non-triangulated barrel meshes remain
in the source as editable backups. Existing gun limits and roof-opening aim
requirements are retained and checked against actual exported solids.

Both native crops, frozen diagnostic picks, source/export checks, cold replay
and local comparison live outside the published repository. The local page can
switch V61/V63 at the same primary camera and aim, including a native 640-pixel
crop. Muzzle diagnostic error falls from about 23 to 4.5 native pixels. This
training-view improvement does not establish whole-reference acceptance. The
small aperture, raised fitting, front-sight shape, other cameras and remaining
body contours still need review. V56 PBR and V59 game geometry remain preserved
earlier candidates; neither is promoted to the final V63 material/game result.

## Selected exhibit front fittings and seven-view inspection V64

`Data_GrayTrialV64.json` records a local aperture/fitting layout correction and
omission of the tall generic rectangular front-sight block. Native 2017,
TourGuide and official 2/7 photographs do not show that block on the selected
exhibit. This is a museum-exterior reconstruction decision, not a claim that
wartime armament lacked a front sight. The unresolved dark notch retains its
unverified classification and is not blindly cut through.

The aperture centre and translated fitting follow primary native observations
relative to the previously frozen front-face image-centre nuisance. That
diagnostic translation is not applied to the asset or camera. Metric layout,
function and concealed attachment remain inferred. The old V62 approximate
raised-tip patch point is not treated as a proven silhouette extremum.

`Script_Type94FrontDetailTrial.py` conserves the hashed V63 editable source,
replaces the moving paint owner and removes the actual isolated sight component
in the gun frame. The four remaining barrel components and all 235 other mesh
surfaces are exact. The source retains the previous steel mesh for editing.
The raw verifier's exposed-ball gap ray follows the fitting's declared upper
probe with its original 17 mm left/2 mm down offset; its physical cap/depth
requirements remain unchanged. Both V55 and V63 pass the updated verifier and
retain their original cold-rebuild GLB identities.

The local comparison now includes official view 3 of the opposite side and view
6 of the partial rear, with the original pixels and retained conditional camera
family. The large foreground trailer in view 6 is a separate asset and also
occludes the tank. Lens display and file/pose identity are verified separately
from physical calibration. Remaining opposite-side wheel/body alignment must
use visible tyre arcs and independently checked body features; optical covers
still cannot be substituted for hidden mechanical centres. These added views
remain inspections, not whole-reference acceptance. Final high/low PBR and the
game derivative must follow the final accepted geometry.

## Visibility-filtered opposite-side diagnostics V65

`Data_ReferenceAuditV65.json` preserves the V64 model and retained camera family
after testing tyre-only camera fits, body-anchored fits and a conditional common
tyre-radius/four-wheel-forward-layout experiment. These are diagnostics, not
adopted camera or geometry corrections.

The actual tyre vertices distinguish the 176.266 mm outer tread, 168.266 mm
front shoulder and 151.266 mm inner sidewall profiles at the declared section.
These values are reconstruction parameters, not museum measurements. Twenty
fresh right-side contour points were reduced to nineteen in a sensitivity run
after the current model's full-asset BVH placed one corresponding ray on the
Hull/arm owner. This is a conditional model-visibility filter, not proof of that
point's identity in the photo; the original twenty points remain archived. Two
far driver corners have unproven photo correspondences and their source rays do
not reach the declared construction vertices directly;
the upper near construction vertex is not a direct surface hit at its bevel.
The lower near corner is an actual visible surface datum. These roles must not
be silently mixed in later calibration.

Even after visibility filtering, tyre-only and near-edge-anchored camera fits
move held-out turret-flank contours by about 23--39 native pixels. The existing
family places the three flank diagnostics within about 0.4 native pixel; this
limited line agreement does not establish whole calibration. A two-view radius
and forward-layout fit improves its training arcs but worsens the third held-out
view, so no physical trial is built or promoted from it.

The local page renders the same actual V64 GLB under the baseline and both
filtered camera candidates. Its 108 mathematical/actual-browser projections and
three lens-shader cases are checked separately from photo correspondence. The
full objective remains open. Continue with clearer native primary-2017 tyre
boundaries and coupled multi-view body/running-gear constraints; do not fit
hidden mechanical axes to optical covers or accept a tyre-only improvement as
whole-reference success. A refreshed high textured preview can proceed while
shape review continues; final PBR and the game derivative must follow the final
accepted geometry.

## Latest-geometry high material preview V66

`Data_SurfaceStudyV66.json` records twelve fresh Base/Normal/ORM maps on the
preserved V64 editable source: paint 4K, track and steel 2K, rubber 1K. All 237
oriented mesh surfaces, 292 pose/control nodes and the root frame remain exact.
The high preview is not the final accepted reference model or game derivative.

Appended construction meshes can retain material names such as
`Material_Type94Paint.002`. The first V66 candidate exposed an untextured gray MG
front even though the four main PBR families existed. It is rejected and saved
under `Versions/InitialUnboundGun`. The fresh-build entry now normalizes every
rendered source slot to its canonical role before atlas selection; the actual
MG paint owner joins all fifty paint bake meshes. Raw/runtime/source checks
cover actual material bindings, and the stricter verifier rejects the old
artifact while retaining V56 acceptance.

Primary native close-ups distinguish the black running surface from the visible
olive annular front finish. An inferred opaque coating is rasterized on exactly
384 outward planar faces of eight road wheels using their actual fresh UVs.
Neither rubber-overpaint nor metal-retainer substrate identity is asserted.
The black tread and all uncoated atlas pixels, AO and tangent-normal pixels are
retained exactly. Empty atlas padding is filled from valid texels without
dilating coating across occupied uncoated faces. Source authoring attributes
and nodes remain editable; the source packs twelve runtime maps plus the
editable paint-wear mask.

Rebuild the isolated preview with
`node Taierzhuang1938/_blender/Script_BuildType94MaterialPreviewV66.mjs`.
`--dry-run` lists the five stages without writing files. The command uses the
owned Blender batch launcher and Python with NumPy/Pillow; no image-generation
service or transient SciPy package is needed. Source reopen/reexport preserves
every named oriented surface, all twelve image pixels and material bindings.
Matched source/import Cycles views and the actual browser preview are inspected;
the current UV raster passes and retained V56 wear replay are byte-checked.

The local material/gray comparison uses the same retained reference cameras and
original photos, so the surface families can aid tyre-profile identification.
Lighting is not a reconstruction of the original photo exposure. Continue the
primary/multi-view shape review and then generate the final accepted-revision
low PBR projection and game derivative; the retained V59 geometry is not that
final derivative.

## Layered metal wear V68

`Data_SurfaceStudyV68.json` responds to the requested stronger metal-wear feel.
It retains the exact V66 position/UV corner sets, all 237 named surfaces and 292
pose/control nodes. V66 remains the comparison baseline. No shape/camera
adoption is implied by this finish study.

V66 metric chips were mostly subpixel at the actual atlas density. V68 gives
real convex edges broken scuff halos and more solid conductive cores, while
flat handling scratches primarily vary roughness and shallow relief. A trial
with pale, regular deep-scratch strips was visually rejected and archived;
those marks are not promoted. Coplanar metric sampling and triangle clipping
avoid drawing the triangulation. Track polishing is restricted to the actual
authored contact lands, preserving cavity finish and the whole AO channels.
Rubber and gun-steel maps remain exact.

Thin paint-loss relief is baked from the source V66 normal plus the editable
wear-height mask. Underlying coarse grain is reduced, the 200 micrometre edge
loss and 8 micrometre scratch relief are artistic parameters, and no vertices
are displaced. Original normal and mask inputs remain packed in the editable
source. The local page switches V66/V68 materials on the same live geometry,
UVs, camera and lighting; a near view and light-position control expose the
reflectance differences without altering one comparison side.

Rebuild with
`node Taierzhuang1938/_blender/Script_BuildType94WearPreviewV68.mjs`;
`--dry-run` prints its stages without starting them. Actual source reopen,
reexported image/binding parity, runtime movement and UV/geometry identity are
verified. Wear amount/placement remains inferred. Whole-reference alignment,
final low tangent-space projection and the accepted-revision game derivative
remain required.
