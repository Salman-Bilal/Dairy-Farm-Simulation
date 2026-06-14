/* ==========================================================================
   AstroFarm Core Simulation Logic
   ========================================================================== */

// --- Global Constants & CDNs Checks ---
const BREEDS = ['Holstein', 'Jersey', 'Sahiwal', 'Cholistani'];
const NAMES = ['Daisy', 'Bessie', 'Molly', 'Bella', 'Lola', 'Lucy', 'Stella', 'Luna'];
const FEEDS = ['Standard Pasture', 'Alfalfa Concentrate', 'High-Protein Blend', 'Low-Cost Roughage'];

const BREED_MAX_MILK = { Holstein: 30, Jersey: 22, Sahiwal: 18, Cholistani: 16 };

const GRAZING_ZONES = [
    { name: 'lush', minX: 2, maxX: 32, minZ: 2, maxZ: 32, color: 0x14532d, opacity: 0.28 },
    { name: 'moderate', minX: -28, maxX: 28, minZ: -20, maxZ: 20, color: 0x166534, opacity: 0.15 },
    { name: 'sparse', minX: -36, maxX: -10, minZ: -36, maxZ: -8, color: 0x4d7c0f, opacity: 0.22 }
];

const WEATHER_TYPES = ['sunny', 'cloudy', 'hot', 'rainy'];
const WEATHER_ICONS = { sunny: '☀️', cloudy: '⛅', hot: '🌡️', rainy: '🌧️' };

// --- Simulation State ---
const state = {
    herd: [],
    selectedCow: null,
    comparisonCows: [],
    hoveredCow: null,
    timeOfDay: 8.0,
    day: 1,
    timeSpeed: 1.0,
    isPaused: false,
    milkingActive: false,
    milkingProgress: 0.0,
    totalMilkCollected: 0.0,
    lifetimeProfit: 250.00,
    dailyProfitDelta: 0.0,
    history: [],
    cowHistory: {},
    weather: 'sunny',
    troughFillLevel: 1.0,
    waterLevel: 1.0,
    lastMilkingGrades: {},
    milkingStationPos: { x: -8, z: -5 },
    waterTroughPos: { x: 10, z: -8 },
    barnPos: { x: -12, z: -8 },
    troughMeshes: null,
    waterMeshes: null
};

// --- Three.js Globals ---
let scene, camera, renderer, controls;
let sunLight, moonLight, ambientLight;
let sunOrb, moonOrb, starField;
let raycaster, mouse;
let lastTime = 0;
let labelContainer;

// --- Chart.js Globals ---
const charts = {};

const HEALTH_COLORS = {
    Healthy: '#10b981',
    'At Risk': '#f59e0b',
    Sick: '#ef4444'
};

function getHealthColor(status) {
    return HEALTH_COLORS[status] || '#9ca3af';
}

function getGrazingZoneAt(x, z) {
    for (const zone of GRAZING_ZONES) {
        if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
            return zone;
        }
    }
    return null;
}

function pickGrazingTarget() {
    if (Math.random() < 0.65) {
        const lush = GRAZING_ZONES.find(z => z.name === 'lush');
        return {
            x: lush.minX + Math.random() * (lush.maxX - lush.minX),
            z: lush.minZ + Math.random() * (lush.maxZ - lush.minZ)
        };
    }
    let x = (Math.random() - 0.5) * 56;
    let z = (Math.random() - 0.5) * 56;
    while (x < -2 && z < -2) {
        x = (Math.random() - 0.5) * 56;
        z = (Math.random() - 0.5) * 56;
    }
    return { x, z };
}

function getEffectiveBiometrics(cow) {
    let temp = cow.bodyTemperatureC;
    let stress = cow.stressLevel;
    let activity = cow.activityLevel;

    if (state.weather === 'hot') temp += 0.5;
    if (state.weather === 'rainy') stress = Math.max(0, stress - 1.0);

    stress += (1 - state.waterLevel) * 3;
    if (state.troughFillLevel < 0.3) stress += 2.0;
    else if (state.troughFillLevel < 0.6) stress += 0.5;

    const zone = getGrazingZoneAt(cow.x, cow.z);
    if (zone && zone.name === 'lush') {
        activity = Math.min(8000, activity + 500);
    }

    return {
        bodyTemperatureC: Math.round(temp * 10) / 10,
        stressLevel: Math.round(Math.min(10, stress) * 10) / 10,
        activityLevel: Math.floor(activity)
    };
}

function gradeFromRatio(ratio) {
    if (ratio >= 0.9) return 'A';
    if (ratio >= 0.8) return 'B';
    if (ratio >= 0.7) return 'C';
    if (ratio >= 0.6) return 'D';
    if (ratio >= 0.5) return 'E';
    return 'F';
}

function hexToThreeColor(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

function updateHealthRingVisual(cow) {
    if (!cow.healthRing) return;
    const color = hexToThreeColor(getHealthColor(cow.healthStatus));
    cow.healthRing.material.color.setHex(color);
    cow.healthDot.material.color.setHex(color);
}

function updateCowCompareHighlights() {
    state.herd.forEach(c => {
        if (!c.compareRing) return;
        const inCompare = state.comparisonCows.some(cc => cc.id === c.id);
        c.compareRing.visible = inCompare;
    });
}

/* ==========================================================================
   Procedural Spot Texture Generator for Cows
   ========================================================================== */
function generateSpotTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base background color (cow white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);

    // Draw random organic black blobs for spots
    ctx.fillStyle = '#111111';
    const numSpots = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numSpots; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = 30 + Math.random() * 60;
        
        ctx.beginPath();
        // Draw irregular spots using multiple overlapping circles
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.arc(x + radius * 0.4, y + radius * 0.2, radius * 0.8, 0, Math.PI * 2);
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/* ==========================================================================
   Model Helper: Barn & Pasture Construction
   ========================================================================== */
function buildEnvironment() {
    // 1. Pasture Plane (Flat Green Field)
    const pastureGeo = new THREE.PlaneGeometry(80, 80);
    const pastureMat = new THREE.MeshStandardMaterial({ 
        color: 0x1f3d24, // Deep rich forest-green
        roughness: 0.9,
        metalness: 0.1
    });
    const pasture = new THREE.Mesh(pastureGeo, pastureMat);
    pasture.rotation.x = -Math.PI / 2;
    pasture.receiveShadow = true;
    scene.add(pasture);

    // Grazing zone overlays
    GRAZING_ZONES.forEach(zone => {
        const w = zone.maxX - zone.minX;
        const d = zone.maxZ - zone.minZ;
        const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            new THREE.MeshBasicMaterial({
                color: zone.color,
                transparent: true,
                opacity: zone.opacity,
                depthWrite: false
            })
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.set((zone.minX + zone.maxX) / 2, 0.03, (zone.minZ + zone.maxZ) / 2);
        scene.add(patch);
    });

    // 2. Fences (Bordering pasture)
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.8 });
    const fenceGroup = new THREE.Group();
    
    // Simple blocky fence rails along the borders
    const fenceLength = 76;
    const borderPositions = [
        { x: 0, z: -38, r: 0 },
        { x: 0, z: 38, r: 0 },
        { x: -38, z: 0, r: Math.PI / 2 },
        { x: 38, z: 0, r: Math.PI / 2 }
    ];

    borderPositions.forEach(pos => {
        const segment = new THREE.Group();
        // Main horizontal rails
        const rail1 = new THREE.Mesh(new THREE.BoxGeometry(fenceLength, 0.15, 0.1), fenceMat);
        rail1.position.y = 1.0;
        rail1.castShadow = true;
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(fenceLength, 0.15, 0.1), fenceMat);
        rail2.position.y = 0.5;
        rail2.castShadow = true;
        segment.add(rail1, rail2);

        // Vertical posts
        const numPosts = 10;
        for (let i = 0; i < numPosts; i++) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), fenceMat);
            post.position.x = -fenceLength/2 + (i * (fenceLength / (numPosts-1)));
            post.position.y = 0.7;
            post.castShadow = true;
            segment.add(post);
        }

        segment.position.set(pos.x, 0, pos.z);
        segment.rotation.y = pos.r;
        fenceGroup.add(segment);
    });
    scene.add(fenceGroup);

    // 3. Barn (Stylized Red Farmhouse)
    const barnGroup = new THREE.Group();
    barnGroup.position.set(state.barnPos.x, 0, state.barnPos.z);

    // Red Main Barn structure
    const barnBaseMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 }); // Red walls
    const barnBase = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), barnBaseMat);
    barnBase.position.y = 3;
    barnBase.castShadow = true;
    barnBase.receiveShadow = true;
    barnGroup.add(barnBase);

    // Barn Roof (Using a 4-sided Cone rotated 45 deg, styled dark grey)
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.5, 4, 4), roofMat);
    roof.position.set(0, 7.5, 0);
    roof.rotation.y = Math.PI / 4; // Rotate to align square shape with walls
    roof.castShadow = true;
    barnGroup.add(roof);

    // Barn Sliding Doors
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.9 }); // White doors
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const doorGroup = new THREE.Group();

    const doorL = new THREE.Mesh(new THREE.BoxGeometry(2, 4.5, 0.2), doorMat);
    doorL.position.set(-1.0, 2.25, 4.05);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(2, 4.5, 0.2), doorMat);
    doorR.position.set(1.0, 2.25, 4.05);

    // Door cross designs (stylized X marks on the barn doors)
    const xMat = new THREE.MeshStandardMaterial({ color: 0x991b1b });
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.8, 0.05), xMat);
    cross1.rotation.z = Math.PI / 4;
    cross1.position.z = 0.12;
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.8, 0.05), xMat);
    cross2.rotation.z = -Math.PI / 4;
    cross2.position.z = 0.12;
    doorL.add(cross1.clone(), cross2.clone());
    doorR.add(cross1.clone(), cross2.clone());

    doorGroup.add(doorL, doorR);
    barnGroup.add(doorGroup);

    // Small Silo structure alongside the barn
    const siloMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 }); // Grey metallic
    const siloBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 16), siloMat);
    siloBase.position.set(8, 4, 0);
    siloBase.castShadow = true;
    siloBase.receiveShadow = true;
    barnGroup.add(siloBase);

    const siloTop = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 8), roofMat);
    siloTop.position.set(8, 8, 0);
    siloTop.castShadow = true;
    barnGroup.add(siloTop);

    scene.add(barnGroup);

    // 4. Feeding/Milking Station (Fenced trough area in front of the barn)
    const stationGroup = new THREE.Group();
    stationGroup.position.set(state.milkingStationPos.x, 0, state.milkingStationPos.z);

    // Milking Trough (Long metal feeder box)
    const troughMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5 });
    const trough = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 1.2), troughMat);
    trough.position.y = 0.4;
    trough.castShadow = true;
    stationGroup.add(trough);

    // Feed inside trough (animated fill level)
    const feedInsideMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 1.0 });
    const feedLiquid = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.1, 1.0), feedInsideMat);
    feedLiquid.position.set(0, 0.75, 0);
    stationGroup.add(feedLiquid);

    const troughRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const troughStatusRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 32), troughRingMat);
    troughStatusRing.rotation.x = -Math.PI / 2;
    troughStatusRing.position.y = 0.04;
    stationGroup.add(troughStatusRing);

    state.troughMeshes = { feedLiquid, feedInsideMat, statusRing: troughStatusRing, statusRingMat: troughRingMat };

    // Signpost marker
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3d2314 });
    const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15), postMat);
    signPost.position.set(3.2, 1.0, 0);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xef4444 })); // Red indicator
    signBoard.position.set(3.2, 1.7, 0);
    signBoard.rotation.y = Math.PI / 2;
    stationGroup.add(signPost, signBoard);

    scene.add(stationGroup);

    // 4b. Water Trough (separate hydration station)
    const waterGroup = new THREE.Group();
    waterGroup.position.set(state.waterTroughPos.x, 0, state.waterTroughPos.z);

    const waterTroughMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
    const waterTrough = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1.0), waterTroughMat);
    waterTrough.position.y = 0.3;
    waterTrough.castShadow = true;
    waterGroup.add(waterTrough);

    const waterInsideMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, transparent: true, opacity: 0.85 });
    const waterLiquid = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.85), waterInsideMat);
    waterLiquid.position.set(0, 0.55, 0);
    waterGroup.add(waterLiquid);

    const waterRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const waterStatusRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 32), waterRingMat);
    waterStatusRing.rotation.x = -Math.PI / 2;
    waterStatusRing.position.y = 0.04;
    waterGroup.add(waterStatusRing);

    state.waterMeshes = { waterLiquid, waterInsideMat, statusRing: waterStatusRing, statusRingMat: waterRingMat };
    scene.add(waterGroup);

    // 5. Stylized Low-Poly Trees in the corners
    const treeMatTrunk = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const treeMatLeaves = new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.8 });
    
    const treePositions = [
        { x: 25, z: 25 }, { x: -28, z: 30 }, { x: 30, z: -25 }
    ];

    treePositions.forEach(pos => {
        const tree = new THREE.Group();
        tree.position.set(pos.x, 0, pos.z);
        
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 8), treeMatTrunk);
        trunk.position.y = 2;
        trunk.castShadow = true;
        tree.add(trunk);

        // Nested blocky levels for stylized green leaves
        const leaves1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.5, 3.5), treeMatLeaves);
        leaves1.position.y = 4.5;
        leaves1.castShadow = true;
        const leaves2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.0, 2.5), treeMatLeaves);
        leaves2.position.y = 6.0;
        leaves2.castShadow = true;
        tree.add(leaves1, leaves2);

        scene.add(tree);
    });
}

/* ==========================================================================
   Procedural Cow Class Constructor
   ========================================================================== */
class Cow {
    constructor(id, name, breed, age, weight, feed, water) {
        this.id = id;
        this.name = name;
        this.breed = breed;
        this.age = age;
        this.weight = weight;
        this.feed = feed || 'Standard Pasture';
        this.water = water || 65;

        // Biometric variables matching ML models
        this.daysInMilk = Math.floor(50 + Math.random() * 200);
        this.stressLevel = Math.round((2.0 + Math.random() * 6.0) * 10) / 10;
        this.milkDropPercentage = Math.round((2.0 + Math.random() * 15.0) * 10) / 10;
        this.bodyTemperatureC = Math.round((38.2 + Math.random() * 1.5) * 10) / 10;
        this.activityLevel = Math.floor(3000 + Math.random() * 3000);
        this.daysSinceLastHealthy = Math.floor(Math.random() * 15);
        
        // Initial 3D placement
        this.x = (Math.random() - 0.5) * 30 + 10;
        this.z = (Math.random() - 0.5) * 30;
        this.rotationY = Math.random() * Math.PI * 2;
        
        // Behavior states
        this.targetX = this.x;
        this.targetZ = this.z;
        this.idleTimer = Math.random() * 8 + 2;
        this.isIdle = true;
        this.legPhase = 0;
        this.state = 'wander'; // 'wander', 'milking', 'resting'
        
        // Prediction variables
        this.healthStatus = 'Healthy';
        this.healthConfidence = 90.0;
        this.predictedMilk = 20.0;
        this.predictedProfit = 10.0;

        // Visual group
        this.mesh = this.buildMesh();
        
        // Sync coordinates
        this.mesh.position.set(this.x, 0, this.z);
        this.mesh.rotation.y = this.rotationY - Math.PI / 2;
        this.mesh.userData = { cowId: this.id }; // Store reference for Raycasting

        scene.add(this.mesh);
        
        // Update predictions on startup
        this.recalculatePredictions();
    }

    buildMesh() {
        const cowGroup = new THREE.Group();

        // 1. Spot texture body material
        const bodyMat = new THREE.MeshStandardMaterial({ 
            map: generateSpotTexture(),
            roughness: 0.8,
            metalness: 0.0
        });

        // Torso block (larger box)
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.3), bodyMat);
        this.torso.position.y = 1.3;
        this.torso.castShadow = true;
        this.torso.receiveShadow = true;
        cowGroup.add(this.torso);

        // 2. Cow Head (box offset forward)
        this.head = new THREE.Group();
        this.head.position.set(1.4, 1.7, 0); // At the front of torso

        const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), bodyMat);
        headMesh.castShadow = true;
        this.head.add(headMesh);

        // Pink Snout (nostrils box)
        const snoutMat = new THREE.MeshStandardMaterial({ color: 0xffaab0, roughness: 0.9 });
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.6), snoutMat);
        snout.position.set(0.45, -0.1, 0);
        snout.castShadow = true;
        this.head.add(snout);

        // Small black nostrils (details)
        const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const nostrilL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.08), nostrilMat);
        nostrilL.position.set(0.6, -0.05, 0.15);
        const nostrilR = nostrilL.clone();
        nostrilR.position.z = -0.15;
        this.head.add(nostrilL, nostrilR);

        // Horns
        const hornMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.3 });
        const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), hornMat);
        hornL.position.set(-0.1, 0.5, 0.32);
        hornL.rotation.z = -0.1;
        hornL.rotation.x = 0.2;
        const hornR = hornL.clone();
        hornR.position.z = -0.32;
        hornR.rotation.x = -0.2;
        this.head.add(hornL, hornR);

        // Ears (drooping box ears)
        const earMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const earL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.45), earMat);
        earL.position.set(-0.25, 0.2, 0.5);
        earL.rotation.z = -0.2;
        earL.rotation.y = 0.3;
        const earR = earL.clone();
        earR.position.z = -0.5;
        earR.rotation.y = -0.3;
        this.head.add(earL, earR);

        cowGroup.add(this.head);

        // 3. Udder (pink box underneath body)
        const udder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), snoutMat);
        udder.position.set(-0.2, 0.5, 0);
        cowGroup.add(udder);

        // 4. Four Legs (grouped to pivot/rotate at joint point y=0.8 relative)
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        
        // Pivot groups
        this.legFL = new THREE.Group(); this.legFL.position.set(0.8, 0.7, 0.45);
        this.legFR = new THREE.Group(); this.legFR.position.set(0.8, 0.7, -0.45);
        this.legBL = new THREE.Group(); this.legBL.position.set(-0.8, 0.7, 0.45);
        this.legBR = new THREE.Group(); this.legBR.position.set(-0.8, 0.7, -0.45);

        const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), bodyMat);
        legMesh.position.y = -0.4; // Offset mesh center so top joint is pivot
        legMesh.castShadow = true;
        
        // Hoof bottom
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), blackMat);
        hoof.position.y = -0.8;
        legMesh.add(hoof);

        this.legFL.add(legMesh.clone());
        this.legFR.add(legMesh.clone());
        this.legBL.add(legMesh.clone());
        this.legBR.add(legMesh.clone());

        cowGroup.add(this.legFL, this.legFR, this.legBL, this.legBR);

        // 5. Tail (thin box at back)
        this.tailPivot = new THREE.Group();
        this.tailPivot.position.set(-1.2, 1.2, 0);
        
        const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), bodyMat);
        tailMesh.position.y = -0.45;
        const tailBrush = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), blackMat);
        tailBrush.position.y = -0.9;
        tailMesh.add(tailBrush);

        this.tailPivot.add(tailMesh);
        this.tailPivot.rotation.z = -0.1;
        cowGroup.add(this.tailPivot);

        // Store reference to the body material to dynamically change tint
        this.bodyMaterial = bodyMat;

        // Health ring on ground + dot above head
        const ringColor = hexToThreeColor(HEALTH_COLORS.Healthy);
        const ringMat = new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        this.healthRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.1, 32), ringMat);
        this.healthRing.rotation.x = -Math.PI / 2;
        this.healthRing.position.y = 0.04;
        cowGroup.add(this.healthRing);

        this.healthDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), ringMat.clone());
        this.healthDot.position.y = 2.45;
        cowGroup.add(this.healthDot);

        // Compare-mode highlight ring
        const compareMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        this.compareRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 32), compareMat);
        this.compareRing.rotation.x = -Math.PI / 2;
        this.compareRing.position.y = 0.03;
        this.compareRing.visible = false;
        cowGroup.add(this.compareRing);

        this.ringPulse = 0;
        this.currentZone = null;

        return cowGroup;
    }

    async recalculatePredictions() {
        try {
            const bio = getEffectiveBiometrics(this);

            const healthResponse = await fetch('http://127.0.0.1:8000/predict/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    age: this.age,
                    milk_drop_percentage: this.milkDropPercentage,
                    body_temperature_c: bio.bodyTemperatureC,
                    activity_level: bio.activityLevel,
                    stress_level: bio.stressLevel,
                    days_since_last_healthy: this.daysSinceLastHealthy
                })
            });
            const healthData = await healthResponse.json();
            
            this.healthStatus = healthData.health_status;
            this.healthConfidence = healthData.confidence;
            
            // Map health status to numeric code for milk model: Healthy=0, At Risk=1, Sick=2
            let healthStatusNum = 0;
            if (this.healthStatus === 'At Risk') healthStatusNum = 1;
            else if (this.healthStatus === 'Sick') healthStatusNum = 2;

            // 2. Predict Milk Yield
            const milkResponse = await fetch('http://127.0.0.1:8000/predict/milk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    breed: this.breed,
                    age_years: this.age,
                    weight_kg: this.weight,
                    days_in_milk: this.daysInMilk,
                    stress_level: bio.stressLevel,
                    health_status: healthStatusNum
                })
            });
            const milkData = await milkResponse.json();
            let milkYield = milkData.milk_yield;

            const zone = getGrazingZoneAt(this.x, this.z);
            if (zone && zone.name === 'lush') {
                milkYield = Math.round(milkYield * 1.05 * 100) / 100;
            }
            this.predictedMilk = milkYield;
            this.currentZone = zone ? zone.name : 'open';

            // 3. Local individual profit helper (still shown in sidebar)
            const milkRevenue = this.predictedMilk * 0.55; // $0.55 per L
            let feedCost = 2.20;
            if (this.feed === 'High-Protein Blend') feedCost = 5.80;
            else if (this.feed === 'Alfalfa Concentrate') feedCost = 4.20;
            else if (this.feed === 'Low-Cost Roughage') feedCost = 1.10;
            const healthCost = (this.healthStatus === 'Sick') ? 6.00 : (this.healthStatus === 'At Risk' ? 2.50 : 0.0);
            const overhead = 1.20;

            this.predictedProfit = milkRevenue - feedCost - healthCost - overhead;
            this.predictedProfit = Math.round(this.predictedProfit * 100) / 100;

            // Apply health color tint to mesh body
            if (this.bodyMaterial) {
                if (this.healthStatus === 'Healthy') {
                    this.bodyMaterial.color.setHex(0xffffff); // Standard spot texture
                } else if (this.healthStatus === 'At Risk') {
                    this.bodyMaterial.color.setHex(0xfff5aa); // Soft yellowish tint
                } else if (this.healthStatus === 'Sick') {
                    this.bodyMaterial.color.setHex(0xffaaaa); // Reddish tint
                }
            }

            updateHealthRingVisual(this);

            refreshLiveCharts();
            if (state.comparisonCows.length >= 2) updateComparisonPanel();

            if (state.selectedCow === this) {
                updateSidebarData();
            }
            updateHerdStatsSummary();
        } catch (err) {
            console.error("API Fetch Error:", err);
        }
    }

    update(dt) {
        // --- Cow AI Wandering & Animations ---
        const speedMultiplier = (this.healthStatus === 'Healthy') ? 1.0 : (this.healthStatus === 'At Risk' ? 0.45 : 0.08);
        const baseSpeed = 1.8;
        const speed = baseSpeed * speedMultiplier;

        if (this.state === 'milking') {
            const distToStation = Math.sqrt(Math.pow(state.milkingStationPos.x - this.x, 2) + Math.pow(state.milkingStationPos.z - this.z, 2));
            if (distToStation > 1.5) {
                const angle = Math.atan2(state.milkingStationPos.x - this.x, state.milkingStationPos.z - this.z);
                this.rotationY = angle;
                this.x += Math.sin(angle) * speed * dt;
                this.z += Math.cos(angle) * speed * dt;
                this.isIdle = false;
            } else {
                this.isIdle = true;
                this.rotationY = Math.PI / 2;
                if (state.troughFillLevel > 0.05) {
                    this.head.rotation.x = -0.35 + Math.sin(this.legPhase * 4) * 0.08;
                    this.legPhase += dt * 2;
                }
            }
        } else if (this.state === 'eating') {
            const distToWater = Math.sqrt(Math.pow(state.waterTroughPos.x - this.x, 2) + Math.pow(state.waterTroughPos.z - this.z, 2));
            if (distToWater > 1.2) {
                const angle = Math.atan2(state.waterTroughPos.x - this.x, state.waterTroughPos.z - this.z);
                this.rotationY = angle;
                this.x += Math.sin(angle) * speed * dt;
                this.z += Math.cos(angle) * speed * dt;
                this.isIdle = false;
            } else {
                this.isIdle = true;
                this.head.rotation.x = -0.3 + Math.sin(this.legPhase * 3) * 0.06;
                this.legPhase += dt * 2;
            }
        } else {
            // Wandering AI
            if (this.isIdle) {
                this.idleTimer -= dt;
                if (this.idleTimer <= 0) {
                    const target = pickGrazingTarget();
                    this.targetX = target.x;
                    this.targetZ = target.z;

                    this.isIdle = false;
                    this.idleTimer = Math.random() * 12 + 4;
                }
            } else {
                const distToTarget = Math.sqrt(Math.pow(this.targetX - this.x, 2) + Math.pow(this.targetZ - this.z, 2));
                if (distToTarget > 0.8) {
                    const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
                    
                    // Smooth rotation interpolation
                    let diff = angle - this.rotationY;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.rotationY += diff * 4 * dt;

                    this.x += Math.sin(this.rotationY) * speed * dt;
                    this.z += Math.cos(this.rotationY) * speed * dt;

                    // Keep inside fence bounds
                    this.x = Math.max(-36, Math.min(36, this.x));
                    this.z = Math.max(-36, Math.min(36, this.z));
                } else {
                    this.isIdle = true;
                }
            }
        }

        // Apply physical coordinates to meshes
        this.mesh.position.set(this.x, 0, this.z);
        this.mesh.rotation.y = this.rotationY - Math.PI / 2;

        // Animations: Leg swing and tail wiggle
        if (!this.isIdle) {
            // Walking Leg Swings
            this.legPhase += speed * dt * 4;
            const swingAngle = Math.sin(this.legPhase) * 0.45;
            this.legFL.rotation.z = swingAngle;
            this.legBR.rotation.z = swingAngle;
            this.legFR.rotation.z = -swingAngle;
            this.legBL.rotation.z = -swingAngle;

            // Tail wiggle
            this.tailPivot.rotation.z = -0.1 + Math.sin(this.legPhase * 2) * 0.15;
            
            // Soft head bobbing
            this.head.rotation.x = Math.sin(this.legPhase) * 0.05;
        } else {
            // Idle state: return legs to zero position slowly
            this.legFL.rotation.z *= 0.85;
            this.legFR.rotation.z *= 0.85;
            this.legBL.rotation.z *= 0.85;
            this.legBR.rotation.z *= 0.85;
            
            // Slow idle tail swing or head shake
            this.legPhase += dt;
            this.tailPivot.rotation.z = -0.1 + Math.sin(this.legPhase * 0.5) * 0.05;
            
            // Random small shivers if sick
            if (this.healthStatus === 'Sick') {
                this.mesh.position.x += Math.sin(this.legPhase * 30) * 0.015;
            }
        }

        // Health ring pulse
        this.ringPulse += dt * 3;
        const pulse = 0.65 + Math.sin(this.ringPulse) * 0.15;
        if (this.healthRing) this.healthRing.material.opacity = pulse;

        // Selected highlights
        if (state.selectedCow === this) {
            // Subtle hover jump
            this.torso.position.y = 1.3 + Math.sin(Date.now() * 0.005) * 0.06;
            this.mesh.scale.set(1.05, 1.05, 1.05);
        } else {
            this.torso.position.y = 1.3;
            this.mesh.scale.set(1, 1, 1);
        }
    }
}

/* ==========================================================================
   Day/Night Cycle & Backgrounds Lighting Logic
   ========================================================================== */
function setupLighting() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Dynamic Directional Lights (Sun / Moon)
    sunLight = new THREE.DirectionalLight(0xfef08a, 0.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    const d = 40;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    moonLight = new THREE.DirectionalLight(0x93c5fd, 0.25);
    moonLight.castShadow = true;
    scene.add(moonLight);

    // Glowing spheres attached to Sun/Moon positions for visual reference
    sunOrb = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    scene.add(sunOrb);

    moonOrb = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xe0e7ff })
    );
    scene.add(moonOrb);

    // Stars particle field (Fades in at night)
    const starCount = 300;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        // Distribute stars on a high dome sphere
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const radius = 60 + Math.random() * 10;
        
        starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
        starPositions[i+1] = Math.abs(radius * Math.sin(phi) * Math.sin(theta)) + 5; // Top dome only
        starPositions[i+2] = radius * Math.cos(phi);
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0 });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
}

function updateLightingCycle(dt) {
    // 24.0 hours clock
    if (!state.isPaused) {
        state.timeOfDay += dt * 0.15 * state.timeSpeed; // Base speed: 1 day is ~2.7 minutes
        if (state.timeOfDay >= 24.0) {
            state.timeOfDay -= 24.0;
            state.day++;
            // Increment statistics charts daily
            updateDayCounter();
        }
    }

    // Convert timeOfDay (0-24) to sun angles (radians)
    // 06:00 = Dawn (angle 0), 12:00 = Noon (angle PI/2), 18:00 = Dusk (angle PI), 24:00 = Midnight (angle 3PI/2)
    const sunAngle = ((state.timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const radius = 45;

    // Position lights
    const sunX = Math.cos(sunAngle) * radius;
    const sunY = Math.sin(sunAngle) * radius;
    const sunZ = 5;
    
    sunLight.position.set(sunX, sunY, sunZ);
    sunOrb.position.set(sunX, sunY, sunZ);

    moonLight.position.set(-sunX, -sunY, -sunZ);
    moonOrb.position.set(-sunX, -sunY, -sunZ);

    // Sky colors transitions depending on sun altitude (sunY)
    const normalizedSunY = Math.max(-1.0, Math.min(1.0, sunY / radius)); // Range -1 to 1
    
    let skyColor, ambientIntensity, sunLightIntensity;

    if (normalizedSunY > 0.1) {
        // Daytime (Full Sun)
        skyColor = new THREE.Color(0x7dd3fc); // Blue Sky
        ambientIntensity = 0.45;
        sunLightIntensity = 0.9;
        starField.material.opacity = 0.0;
    } else if (normalizedSunY < -0.1) {
        // Nighttime (Full Moon)
        skyColor = new THREE.Color(0x060f09); // Dark green-black night sky
        ambientIntensity = 0.15;
        sunLightIntensity = 0.0;
        starField.material.opacity = 0.8;
    } else {
        // Transitions (Dawn / Dusk)
        const transitionFactor = (normalizedSunY + 0.1) / 0.2; // Range 0 to 1
        
        const dawnColor = new THREE.Color(0xfdba74); // Warm sunset orange
        const dayColor = new THREE.Color(0x7dd3fc);
        const nightColor = new THREE.Color(0x060f09);

        if (sunX > 0) { // Dusk (Sunset)
            skyColor = nightColor.clone().lerp(dawnColor, transitionFactor);
        } else { // Dawn (Sunrise)
            skyColor = dawnColor.clone().lerp(dayColor, transitionFactor);
        }

        ambientIntensity = 0.15 + 0.30 * transitionFactor;
        sunLightIntensity = 0.9 * transitionFactor;
        starField.material.opacity = 0.8 * (1.0 - transitionFactor);
    }

    renderer.setClearColor(skyColor);
    scene.fog = new THREE.FogExp2(skyColor.getHex(), 0.008);
    applyWeatherVisuals(skyColor.getHex());

    // Apply intensities smoothly
    ambientLight.color.setRGB(skyColor.r, skyColor.g, skyColor.b);
    ambientLight.intensity = ambientIntensity;
    sunLight.intensity = sunLightIntensity;

    // Update Sun/Moon scale to hide/show them under pasture plane
    sunOrb.visible = sunY > -2;
    moonOrb.visible = sunY < 2;

    // Update UI clock text
    updateUIClock();

    // Check for milking trigger at 18:00 (6:00 PM)
    if (Math.abs(state.timeOfDay - 18.0) < 0.12 && !state.milkingActive) {
        startMilkingPhase();
    }

    // Morning feeding at 08:00
    if (Math.abs(state.timeOfDay - 8.0) < 0.08 && !state._fedThisMorning) {
        state._fedThisMorning = true;
        triggerMorningFeeding();
    }
    if (state.timeOfDay > 9.0) state._fedThisMorning = false;

    // Cycle weather every 3 days at midnight
    if (Math.abs(state.timeOfDay - 0.05) < 0.08 && state.day % 3 === 0 && !state._weatherCycledToday) {
        state._weatherCycledToday = true;
        const idx = WEATHER_TYPES.indexOf(state.weather);
        setWeather(WEATHER_TYPES[(idx + 1) % WEATHER_TYPES.length]);
    }
    if (state.timeOfDay > 1.0) state._weatherCycledToday = false;
}

/* ==========================================================================
   Trough, Water & Weather Systems
   ========================================================================== */
function updateTroughVisual() {
    if (!state.troughMeshes) return;
    const { feedLiquid, feedInsideMat, statusRingMat } = state.troughMeshes;
    const level = state.troughFillLevel;

    feedLiquid.scale.y = Math.max(0.05, level);
    feedLiquid.position.y = 0.7 + (level * 0.05);

    const empty = new THREE.Color(0x3d2314);
    const full = new THREE.Color(0xd97706);
    feedInsideMat.color.lerpColors(empty, full, level);

    const ringColor = level > 0.6 ? 0x10b981 : (level > 0.3 ? 0xf59e0b : 0xef4444);
    statusRingMat.color.setHex(ringColor);
}

function updateWaterVisual() {
    if (!state.waterMeshes) return;
    const { waterLiquid, waterInsideMat, statusRingMat } = state.waterMeshes;
    const level = state.waterLevel;

    waterLiquid.scale.y = Math.max(0.05, level);
    waterLiquid.position.y = 0.5 + (level * 0.05);
    waterInsideMat.opacity = 0.3 + level * 0.55;

    const ringColor = level > 0.6 ? 0x10b981 : (level > 0.3 ? 0xf59e0b : 0xef4444);
    statusRingMat.color.setHex(ringColor);
}

function depleteResourcesAfterMilking() {
    state.troughFillLevel = Math.max(0, state.troughFillLevel - 0.06 * (state.herd.length / 8));
    state.waterLevel = Math.max(0, state.waterLevel - 0.05);
    updateTroughVisual();
    updateWaterVisual();
    state.herd.forEach(c => c.recalculatePredictions());
}

function refillTrough() {
    if (state.lifetimeProfit < 10) {
        alert('Insufficient funds! Refill costs $10.');
        return;
    }
    state.lifetimeProfit -= 10;
    document.getElementById('live-profit').textContent = state.lifetimeProfit.toFixed(2);
    state.troughFillLevel = 1.0;
    state.herd.forEach(c => { c.stressLevel = Math.min(10, c.stressLevel + 0.5); });
    updateTroughVisual();
    state.herd.forEach(c => c.recalculatePredictions());
    updateHerdStatsSummary();
}

function refillWater() {
    if (state.lifetimeProfit < 5) {
        alert('Insufficient funds! Water refill costs $5.');
        return;
    }
    state.lifetimeProfit -= 5;
    document.getElementById('live-profit').textContent = state.lifetimeProfit.toFixed(2);
    state.waterLevel = 1.0;
    updateWaterVisual();
    state.herd.forEach(c => c.recalculatePredictions());
    updateHerdStatsSummary();
}

function updateWeatherUI() {
    const el = document.getElementById('weather-display');
    if (el) {
        el.textContent = `${WEATHER_ICONS[state.weather]} ${state.weather.charAt(0).toUpperCase() + state.weather.slice(1)}`;
    }
    const select = document.getElementById('weather-select');
    if (select) select.value = state.weather;
}

function applyWeatherVisuals(baseSkyHex) {
    if (!scene.fog) return;
    const overrides = { cloudy: 0x94a3b8, hot: 0xfbbf24, rainy: 0x64748b };
    const densities = { sunny: 0.008, cloudy: 0.009, hot: 0.006, rainy: 0.012 };

    if (state.weather === 'sunny' && baseSkyHex !== undefined) {
        scene.fog.color.setHex(baseSkyHex);
    } else if (overrides[state.weather]) {
        scene.fog.color.setHex(overrides[state.weather]);
    }
    scene.fog.density = densities[state.weather] || 0.008;
}

function setWeather(weather) {
    state.weather = weather;
    updateWeatherUI();
    state.herd.forEach(c => c.recalculatePredictions());
}

function triggerMorningFeeding() {
    if (state.troughFillLevel < 0.05) return;
    state.herd.forEach(c => {
        if (c.state === 'wander') {
            c.state = 'eating';
            c.isIdle = false;
        }
    });
    setTimeout(() => {
        state.herd.forEach(c => {
            if (c.state === 'eating') {
                c.state = 'wander';
                c.isIdle = false;
                c.head.rotation.x = 0;
            }
        });
    }, 8000);
}

/* ==========================================================================
   Cow Hover Tooltip (replaces always-visible labels)
   ========================================================================== */
function setupCowTooltip() {
    labelContainer = document.createElement('div');
    labelContainer.id = 'cow-tooltip-container';
    labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:5;';
    document.body.appendChild(labelContainer);

    const tooltip = document.createElement('div');
    tooltip.id = 'cow-tooltip';
    tooltip.className = 'cow-hover-tooltip hidden';
    labelContainer.appendChild(tooltip);
}

function updateCowTooltip(cow) {
    const tooltip = document.getElementById('cow-tooltip');
    if (!tooltip) return;

    if (!cow) {
        tooltip.classList.add('hidden');
        return;
    }

    const agePct = Math.min(100, Math.max(0, (cow.age / 5) * 100));
    const ageDecline = cow.age > 8;
    const grade = state.lastMilkingGrades[cow.id] || '—';
    const zoneLabel = cow.currentZone ? cow.currentZone.charAt(0).toUpperCase() + cow.currentZone.slice(1) : 'Open';

    tooltip.classList.remove('hidden');
    tooltip.className = `cow-hover-tooltip ${cow.healthStatus.toLowerCase().replace(' ', '')}`;
    tooltip.innerHTML = `
        <div class="tooltip-name">${cow.name}</div>
        <div class="tooltip-row"><i class="fa-solid fa-glass-water"></i> ${cow.predictedMilk.toFixed(1)} L</div>
        <div class="tooltip-row"><i class="fa-solid fa-heart-pulse"></i> ${cow.healthStatus}</div>
        <div class="tooltip-row"><i class="fa-solid fa-seedling"></i> ${zoneLabel} zone</div>
        <div class="tooltip-age-bar">
            <div class="tooltip-age-fill ${ageDecline ? 'declining' : ''}" style="width:${agePct}%"></div>
        </div>
        <div class="tooltip-age-label">Age ${cow.age.toFixed(1)}y ${ageDecline ? '(past peak)' : ''}</div>
        ${grade !== '—' ? `<div class="tooltip-grade">Last milking: <strong>${grade}</strong></div>` : ''}
    `;

    const tempV = new THREE.Vector3();
    tempV.copy(cow.mesh.position);
    tempV.y += 2.6;
    tempV.project(camera);
    if (tempV.z > 1) {
        tooltip.classList.add('hidden');
        return;
    }
    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;
    tooltip.style.transform = `translate(-50%, -110%) translate(${x}px, ${y}px)`;
}

function raycastCowAtMouse() {
    raycaster.setFromCamera(mouse, camera);
    const meshesToCheck = state.herd.map(c => c.mesh);
    const intersects = raycaster.intersectObjects(meshesToCheck, true);
    if (intersects.length === 0) return null;

    let targetGroup = intersects[0].object;
    while (targetGroup && !targetGroup.userData.cowId) {
        targetGroup = targetGroup.parent;
    }
    if (targetGroup && targetGroup.userData.cowId) {
        return state.herd.find(c => c.id === targetGroup.userData.cowId) || null;
    }
    return null;
}

/* ==========================================================================
   State & Predictions UI Updates
   ========================================================================== */
function updateDayCounter() {
    document.getElementById('day-counter').textContent = state.day.toString().padStart(2, '0');
}

function updateUIClock() {
    const hours = Math.floor(state.timeOfDay);
    const mins = Math.floor((state.timeOfDay % 1.0) * 60);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const dispHours = hours % 12 === 0 ? 12 : hours % 12;
    
    const timeStr = `${dispHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${suffix}`;
    document.getElementById('time-counter').textContent = timeStr;

    // Toggle Sun/Moon icons
    const timeIcon = document.getElementById('time-icon');
    if (hours >= 6 && hours < 18) {
        timeIcon.className = 'fa-solid fa-sun time-icon-day';
    } else {
        timeIcon.className = 'fa-solid fa-moon time-icon-night';
    }
}

function updateHerdStatsSummary() {
    let numHealthy = 0;
    let numRisk = 0;
    let numSick = 0;
    let totalMilkEst = 0;
    let totalFeedCost = 0;

    state.herd.forEach(c => {
        if (c.healthStatus === 'Healthy') numHealthy++;
        else if (c.healthStatus === 'At Risk') numRisk++;
        else if (c.healthStatus === 'Sick') numSick++;

        totalMilkEst += c.predictedMilk;
        
        let cFeedCost = 2.20;
        if (c.feed === 'High-Protein Blend') cFeedCost = 5.80;
        else if (c.feed === 'Alfalfa Concentrate') cFeedCost = 4.20;
        else if (c.feed === 'Low-Cost Roughage') cFeedCost = 1.10;
        totalFeedCost += cFeedCost;
    });

    document.getElementById('count-healthy').textContent = numHealthy;
    document.getElementById('count-risk').textContent = numRisk;
    document.getElementById('count-sick').textContent = numSick;

    // Average stats on bottom dashboard
    document.getElementById('stat-avg-milk').textContent = `${(totalMilkEst / state.herd.length).toFixed(1)} L`;
    document.getElementById('stat-feed-cost').textContent = `$${totalFeedCost.toFixed(2)}`;

    updateHerdAverages();
}

function getHerdHealthCounts() {
    let healthy = 0;
    let atRisk = 0;
    let sick = 0;

    state.herd.forEach(c => {
        if (c.healthStatus === 'Healthy') healthy++;
        else if (c.healthStatus === 'At Risk') atRisk++;
        else if (c.healthStatus === 'Sick') sick++;
    });

    return { healthy, atRisk, sick };
}

function getHerdBiometricAverages() {
    const n = state.herd.length || 1;
    let temp = 0;
    let stress = 0;
    let daysInMilk = 0;

    state.herd.forEach(c => {
        temp += c.bodyTemperatureC;
        stress += c.stressLevel;
        daysInMilk += c.daysInMilk;
    });

    return {
        avgTemp: temp / n,
        avgStress: stress / n,
        avgDaysInMilk: daysInMilk / n
    };
}

function updateHerdAverages() {
    const avgs = getHerdBiometricAverages();
    const tempEl = document.getElementById('stat-avg-temp');
    const stressEl = document.getElementById('stat-avg-stress');
    const dimEl = document.getElementById('stat-avg-dim');

    if (tempEl) tempEl.textContent = `${avgs.avgTemp.toFixed(1)} °C`;
    if (stressEl) stressEl.textContent = avgs.avgStress.toFixed(1);
    if (dimEl) dimEl.textContent = `${Math.round(avgs.avgDaysInMilk)} days`;
}

function updateSidebarData() {
    const cow = state.selectedCow;
    if (!cow) return;

    // Set side panel header
    document.getElementById('cow-name').textContent = cow.name;
    document.getElementById('cow-breed-tag').textContent = cow.breed;

    // Set health badge style
    const hBadge = document.getElementById('cow-health-badge');
    hBadge.className = `health-badge ${cow.healthStatus.toLowerCase().replace(' ', '')}`;
    hBadge.querySelector('span').textContent = cow.healthStatus;
    
    const hIcon = hBadge.querySelector('i');
    if (cow.healthStatus === 'Healthy') hIcon.className = 'fa-solid fa-circle-check';
    else if (cow.healthStatus === 'At Risk') hIcon.className = 'fa-solid fa-triangle-exclamation';
    else hIcon.className = 'fa-solid fa-circle-exclamation';

    // Set input values
    document.getElementById('input-breed').value = cow.breed;
    document.getElementById('input-age').value = cow.age;
    document.getElementById('val-age').textContent = cow.age.toFixed(1);
    
    document.getElementById('input-weight').value = cow.weight;
    document.getElementById('val-weight').textContent = cow.weight;

    document.getElementById('input-days-in-milk').value = cow.daysInMilk;
    document.getElementById('val-days-in-milk').textContent = cow.daysInMilk;

    document.getElementById('input-stress').value = cow.stressLevel;
    document.getElementById('val-stress').textContent = cow.stressLevel.toFixed(1);

    document.getElementById('input-milk-drop').value = cow.milkDropPercentage;
    document.getElementById('val-milk-drop').textContent = cow.milkDropPercentage.toFixed(1);

    document.getElementById('input-temp').value = cow.bodyTemperatureC;
    document.getElementById('val-temp').textContent = cow.bodyTemperatureC.toFixed(1);

    document.getElementById('input-activity').value = cow.activityLevel;
    document.getElementById('val-activity').textContent = cow.activityLevel;

    document.getElementById('input-days-healthy').value = cow.daysSinceLastHealthy;
    document.getElementById('val-days-healthy').textContent = cow.daysSinceLastHealthy;

    // Set predictions results
    const hConfText = document.getElementById('pred-health-conf');
    const hValText = document.getElementById('pred-health-val');
    hConfText.textContent = `${cow.healthConfidence}% Conf.`;
    hValText.textContent = cow.healthStatus.toUpperCase();
    
    hValText.className = 'pred-val';
    if (cow.healthStatus === 'Healthy') hValText.classList.add('text-green');
    else if (cow.healthStatus === 'At Risk') hValText.classList.add('text-yellow');
    else hValText.classList.add('text-red');

    const mValText = document.getElementById('pred-milk-val');
    mValText.textContent = `${cow.predictedMilk.toFixed(1)} Liters`;
    
    // Scale regression confidence indicators dynamically
    const maxMilkPossible = 40.0;
    const milkPercent = Math.min(100, (cow.predictedMilk / maxMilkPossible) * 100);
    document.getElementById('pred-milk-bar').style.width = `${milkPercent}%`;

    const pValText = document.getElementById('pred-profit-val');
    pValText.textContent = `${cow.predictedProfit >= 0 ? '+' : ''}$${cow.predictedProfit.toFixed(2)}`;
    
    pValText.className = 'pred-val';
    if (cow.predictedProfit >= 0) pValText.classList.add('text-green');
    else pValText.classList.add('text-red');

    const ageBar = document.getElementById('sidebar-age-bar');
    const ageLabel = document.getElementById('sidebar-age-label');
    if (ageBar) {
        const agePct = Math.min(100, Math.max(0, (cow.age / 5) * 100));
        ageBar.style.width = `${agePct}%`;
        ageBar.className = cow.age > 8 ? 'age-bar-fill declining' : 'age-bar-fill';
    }
    if (ageLabel) {
        ageLabel.textContent = cow.age > 8
            ? `${cow.age.toFixed(1)} years (declining)`
            : `${cow.age.toFixed(1)} years (peak ~5y)`;
    }

    const gradeEl = document.getElementById('pred-milk-grade');
    if (gradeEl) {
        const grade = state.lastMilkingGrades[cow.id];
        gradeEl.textContent = grade ? `Milking Grade: ${grade}` : '';
        gradeEl.className = grade ? `milking-grade grade-${grade.toLowerCase()}` : 'milking-grade';
    }
}

/* ==========================================================================
   Milking Collection Phase Logic
   ========================================================================== */
function startMilkingPhase() {
    state.milkingActive = true;
    state.milkingProgress = 0.0;

    // Move all cows to station
    state.herd.forEach(c => {
        c.state = 'milking';
        c.isIdle = false;
    });

    // Pause general day speed transitions during milking screen
    state.timeSpeed = 0.2;

    // Show Progress Bar UI Overlay
    const overlay = document.getElementById('milking-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('milking-progress-bar').style.width = '0%';
    document.getElementById('milking-progress-text').textContent = '0% Completed';
}

function updateMilkingSequence(dt) {
    if (!state.milkingActive) return;

    // Check if cows have reached the barn trough
    let arrivedCows = 0;
    state.herd.forEach(c => {
        const dist = Math.sqrt(Math.pow(state.milkingStationPos.x - c.x, 2) + Math.pow(state.milkingStationPos.z - c.z, 2));
        if (dist <= 1.6) arrivedCows++;
    });

    // If cows are at the milking station, progress bar fills
    if (arrivedCows >= state.herd.length - 2) { // Allow slight delay for sluggards
        state.milkingProgress += dt * 35.0; // Milking takes 3 seconds
        if (state.milkingProgress >= 100.0) {
            state.milkingProgress = 100.0;
            finishMilkingPhase();
        }
        
        document.getElementById('milking-progress-bar').style.width = `${state.milkingProgress}%`;
        document.getElementById('milking-progress-text').textContent = `${Math.floor(state.milkingProgress)}% Collected`;
    }
}

async function finishMilkingPhase() {
    state.milkingActive = false;
    
    // Resume standard time speed controls
    state.timeSpeed = parseFloat(document.getElementById('speed-slider').value) / 10;

    // Hide progress bar overlay
    const overlay = document.getElementById('milking-overlay');
    overlay.classList.add('hidden');

    // Aggregate statistics
    let dailyCombinedMilk = 0;
    let sickCowCount = 0;
    let totalFeedCost = 0;

    state.herd.forEach(c => {
        c.state = 'wander';
        c.isIdle = false;
        c.targetX = (Math.random() - 0.5) * 30 + 10;
        c.targetZ = (Math.random() - 0.5) * 30;

        dailyCombinedMilk += c.predictedMilk;
        if (c.healthStatus === 'Sick') sickCowCount++;

        let cFeedCost = 2.20;
        if (c.feed === 'High-Protein Blend') cFeedCost = 5.80;
        else if (c.feed === 'Alfalfa Concentrate') cFeedCost = 4.20;
        else if (c.feed === 'Low-Cost Roughage') cFeedCost = 1.10;
        totalFeedCost += cFeedCost;
    });

    // Get the last 7 daily profits (most recent to oldest)
    const lags = state.history.slice(-7).reverse().map(h => h.dailyProfit);

    try {
        const response = await fetch('http://127.0.0.1:8000/predict/profit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profit_lags: lags,
                sick_cow_count: sickCowCount,
                total_milk_l: dailyCombinedMilk,
                feed_cost_pkr: totalFeedCost
            })
        });
        const data = await response.json();
        
        const dailyCombinedProfit = data.predicted_profit;

        state.totalMilkCollected += dailyCombinedMilk;
        state.lifetimeProfit += dailyCombinedProfit;
        state.dailyProfitDelta = dailyCombinedProfit;

        // Update counters values
        document.getElementById('stat-total-milk').textContent = `${Math.floor(state.totalMilkCollected)} L`;
        
        // Profit updates animate ticker
        const profitEl = document.getElementById('live-profit');
        animateNumberTicker(profitEl, parseFloat(profitEl.textContent), state.lifetimeProfit);

        const deltaEl = document.getElementById('profit-delta');
        const deltaText = document.getElementById('live-profit-delta');
        deltaText.textContent = `${state.dailyProfitDelta >= 0 ? '+' : ''}$${state.dailyProfitDelta.toFixed(2)} today`;

        if (state.dailyProfitDelta >= 0) {
            deltaEl.className = 'profit-delta positive';
            deltaEl.querySelector('i').className = 'fa-solid fa-arrow-trend-up';
        } else {
            deltaEl.className = 'profit-delta negative';
            deltaEl.querySelector('i').className = 'fa-solid fa-arrow-trend-down';
        }

        // Save daily history
        saveDailyHistory(dailyCombinedMilk, dailyCombinedProfit);

        state.herd.forEach(c => {
            const maxMilk = BREED_MAX_MILK[c.breed] || 25;
            const healthMult = c.healthStatus === 'Healthy' ? 1 : (c.healthStatus === 'At Risk' ? 0.85 : 0.6);
            const theoretical = maxMilk * healthMult;
            const ratio = theoretical > 0 ? c.predictedMilk / theoretical : 0;
            state.lastMilkingGrades[c.id] = gradeFromRatio(ratio);
        });
        showMilkingGradesToast();
        depleteResourcesAfterMilking();

        updateHerdStatsSummary();
        if (state.selectedCow) updateSidebarData();
        updateComparisonPanel();
    } catch (err) {
        console.error("API Profit Fetch Error:", err);
    }
}

function animateNumberTicker(element, start, end) {
    const duration = 1200; // ms
    const startTime = performance.now();

    function updateTicker(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        // Ease out quadratic
        const easeVal = progress * (2 - progress);
        const current = start + (end - start) * easeVal;
        element.textContent = current.toFixed(2);

        if (progress < 1.0) {
            requestAnimationFrame(updateTicker);
        }
    }
    requestAnimationFrame(updateTicker);
}

function showMilkingGradesToast() {
    const toast = document.getElementById('milking-grades-toast');
    if (!toast) return;

    const grades = state.herd.map(c =>
        `${c.name}: ${state.lastMilkingGrades[c.id] || '?'}`
    ).join(' · ');

    toast.textContent = `Milking efficiency — ${grades}`;
    toast.classList.remove('hidden');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 6000);
}

/* ==========================================================================
   Compare Cows Mode & Radar Chart
   ========================================================================== */
function toggleComparisonCow(cow) {
    const idx = state.comparisonCows.findIndex(c => c.id === cow.id);
    if (idx >= 0) {
        state.comparisonCows.splice(idx, 1);
    } else if (state.comparisonCows.length < 2) {
        state.comparisonCows.push(cow);
    } else {
        state.comparisonCows[1] = cow;
    }
    updateCowCompareHighlights();
    updateComparisonPanel();
}

function normalizeCowMetric(cow, metric) {
    switch (metric) {
        case 'milk':
            return Math.min(100, (cow.predictedMilk / (BREED_MAX_MILK[cow.breed] || 25)) * 100);
        case 'stress':
            return Math.max(0, (10 - cow.stressLevel) / 10 * 100);
        case 'temp':
            return Math.max(0, 100 - Math.abs(cow.bodyTemperatureC - 38.5) * 40);
        case 'activity':
            return Math.min(100, (cow.activityLevel / 8000) * 100);
        case 'dim': {
            const optimal = 150;
            return Math.max(0, 100 - Math.abs(cow.daysInMilk - optimal) / 3);
        }
        default:
            return 50;
    }
}

function updateComparisonPanel() {
    const panel = document.getElementById('comparison-panel');
    if (!panel) return;

    if (state.comparisonCows.length < 2) {
        panel.classList.add('hidden');
        if (charts.radar) charts.radar.destroy();
        delete charts.radar;
        return;
    }

    panel.classList.remove('hidden');
    const [a, b] = state.comparisonCows;

    document.getElementById('compare-name-a').textContent = a.name;
    document.getElementById('compare-name-b').textContent = b.name;

    const rows = [
        { label: 'Breed', key: 'breed', higher: null },
        { label: 'Age (y)', key: 'age', higher: false },
        { label: 'Stress', key: 'stressLevel', higher: false },
        { label: 'Body Temp', key: 'bodyTemperatureC', higher: false },
        { label: 'Milk (L)', key: 'predictedMilk', higher: true },
        { label: 'Health', key: 'healthStatus', higher: true },
        { label: 'Profit ($)', key: 'predictedProfit', higher: true }
    ];

    const tbody = document.getElementById('compare-table-body');
    tbody.innerHTML = rows.map(row => {
        const valA = a[row.key];
        const valB = b[row.key];
        let clsA = '';
        let clsB = '';

        if (row.higher !== null && typeof valA === 'number' && typeof valB === 'number') {
            if (valA > valB) { clsA = 'compare-better'; clsB = 'compare-worse'; }
            else if (valB > valA) { clsB = 'compare-better'; clsA = 'compare-worse'; }
        } else if (row.key === 'healthStatus') {
            const rank = { Healthy: 3, 'At Risk': 2, Sick: 1 };
            if (rank[valA] > rank[valB]) { clsA = 'compare-better'; clsB = 'compare-worse'; }
            else if (rank[valB] > rank[valA]) { clsB = 'compare-better'; clsA = 'compare-worse'; }
        }

        const fmt = (v) => typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v;
        return `<tr>
            <td class="${clsA}">${fmt(valA)}</td>
            <td>${row.label}</td>
            <td class="${clsB}">${fmt(valB)}</td>
        </tr>`;
    }).join('');

    refreshRadarChart();
}

function setupRadarChart() {
    const canvas = document.getElementById('cow-radar-chart');
    if (!canvas || state.comparisonCows.length < 2) return;

    if (charts.radar) charts.radar.destroy();

    const [a, b] = state.comparisonCows;
    const labels = ['Milk', 'Low Stress', 'Temp', 'Activity', 'Days in Milk'];

    charts.radar = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels,
            datasets: [
                {
                    label: a.name,
                    data: ['milk', 'stress', 'temp', 'activity', 'dim'].map(m => normalizeCowMetric(a, m)),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 2,
                    pointRadius: 3
                },
                {
                    label: b.name,
                    data: ['milk', 'stress', 'temp', 'activity', 'dim'].map(m => normalizeCowMetric(b, m)),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } }
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { display: false, stepSize: 25 },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    pointLabels: { color: '#9ca3af', font: { size: 9 } }
                }
            }
        }
    });
}

function refreshRadarChart() {
    if (state.comparisonCows.length < 2) return;
    if (!charts.radar) {
        setupRadarChart();
        return;
    }
    const [a, b] = state.comparisonCows;
    const metrics = ['milk', 'stress', 'temp', 'activity', 'dim'];
    charts.radar.data.datasets[0].label = a.name;
    charts.radar.data.datasets[0].data = metrics.map(m => normalizeCowMetric(a, m));
    charts.radar.data.datasets[1].label = b.name;
    charts.radar.data.datasets[1].data = metrics.map(m => normalizeCowMetric(b, m));
    charts.radar.update();
}

function clearComparison() {
    state.comparisonCows = [];
    updateCowCompareHighlights();
    updateComparisonPanel();
}

/* ==========================================================================
   Chart.js Dashboard Setup and Tracking
   ========================================================================== */
function chartAxisOptions(leftColor, leftTitle, rightColor, rightTitle) {
    const scales = {
        x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
        }
    };

    if (leftTitle) {
        scales.y = {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: leftColor, font: { family: 'Inter', size: 10 } },
            title: { display: true, text: leftTitle, color: leftColor, font: { size: 10 } }
        };
    }

    if (rightTitle) {
        scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: rightColor, font: { family: 'Inter', size: 10 } },
            title: { display: true, text: rightTitle, color: rightColor, font: { size: 10 } }
        };
    }

    return scales;
}

function setupTrendChart() {
    const ctx = document.getElementById('herd-trend-chart').getContext('2d');
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: state.history.map(h => `Day ${h.day}`),
            datasets: [
                {
                    label: 'Herd Daily Milk (L)',
                    data: state.history.map(h => h.milk),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Cumulative Profit ($)',
                    data: state.history.map(h => h.cumProfit),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } }
            },
            scales: chartAxisOptions('#10b981', 'Milk (L)', '#3b82f6', 'Profit ($)')
        }
    });
}

function setupMilkYieldChart() {
    const ctx = document.getElementById('milk-yield-chart').getContext('2d');
    const sorted = [...state.herd].sort((a, b) => b.predictedMilk - a.predictedMilk);

    charts.milkYield = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(c => c.name),
            datasets: [{
                label: 'Predicted Milk (L)',
                data: sorted.map(c => c.predictedMilk),
                backgroundColor: sorted.map(c => getHealthColor(c.healthStatus)),
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel(ctx) {
                            const cow = sorted[ctx.dataIndex];
                            return `${cow.breed} · ${cow.healthStatus}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#10b981', font: { family: 'Inter', size: 10 } },
                    title: { display: true, text: 'Liters', color: '#10b981', font: { size: 10 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
}

function setupHealthTimelineChart() {
    const ctx = document.getElementById('health-timeline-chart').getContext('2d');
    charts.healthTimeline = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: state.history.map(h => `Day ${h.day}`),
            datasets: [
                {
                    label: 'Healthy',
                    data: state.history.map(h => h.healthy),
                    backgroundColor: HEALTH_COLORS.Healthy,
                    borderRadius: 2
                },
                {
                    label: 'At Risk',
                    data: state.history.map(h => h.atRisk),
                    backgroundColor: HEALTH_COLORS['At Risk'],
                    borderRadius: 2
                },
                {
                    label: 'Sick',
                    data: state.history.map(h => h.sick),
                    backgroundColor: HEALTH_COLORS.Sick,
                    borderRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, boxWidth: 12 }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                    title: { display: true, text: 'Cow Count', color: '#9ca3af', font: { size: 10 } }
                }
            }
        }
    });
}

function setupStressMilkScatter() {
    const ctx = document.getElementById('stress-milk-scatter').getContext('2d');
    charts.scatter = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: ['Healthy', 'At Risk', 'Sick'].map(status => ({
                label: status,
                data: state.herd
                    .filter(c => c.healthStatus === status)
                    .map(c => ({ x: c.stressLevel, y: c.predictedMilk, name: c.name })),
                backgroundColor: getHealthColor(status),
                pointRadius: 7,
                pointHoverRadius: 9
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, boxWidth: 10 }
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const pt = ctx.raw;
                            return `${pt.name}: ${pt.y.toFixed(1)} L @ stress ${pt.x.toFixed(1)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#f59e0b', font: { family: 'Inter', size: 10 } },
                    title: { display: true, text: 'Stress Level', color: '#f59e0b', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#10b981', font: { family: 'Inter', size: 10 } },
                    title: { display: true, text: 'Milk Yield (L)', color: '#10b981', font: { size: 10 } }
                }
            }
        }
    });
}

function refreshLiveCharts() {
    if (charts.milkYield) {
        const sorted = [...state.herd].sort((a, b) => b.predictedMilk - a.predictedMilk);
        charts.milkYield.data.labels = sorted.map(c => c.name);
        charts.milkYield.data.datasets[0].data = sorted.map(c => c.predictedMilk);
        charts.milkYield.data.datasets[0].backgroundColor = sorted.map(c => getHealthColor(c.healthStatus));
        charts.milkYield.update('none');
    }

    if (charts.scatter) {
        charts.scatter.data.datasets = ['Healthy', 'At Risk', 'Sick'].map(status => ({
            label: status,
            data: state.herd
                .filter(c => c.healthStatus === status)
                .map(c => ({ x: c.stressLevel, y: c.predictedMilk, name: c.name })),
            backgroundColor: getHealthColor(status),
            pointRadius: 7,
            pointHoverRadius: 9
        }));
        charts.scatter.update('none');
    }
}

function refreshHistoryCharts() {
    if (charts.trend) {
        charts.trend.data.labels = state.history.map(h => `Day ${h.day}`);
        charts.trend.data.datasets[0].data = state.history.map(h => h.milk);
        charts.trend.data.datasets[1].data = state.history.map(h => h.cumProfit);
        charts.trend.update();
    }

    if (charts.healthTimeline) {
        charts.healthTimeline.data.labels = state.history.map(h => `Day ${h.day}`);
        charts.healthTimeline.data.datasets[0].data = state.history.map(h => h.healthy);
        charts.healthTimeline.data.datasets[1].data = state.history.map(h => h.atRisk);
        charts.healthTimeline.data.datasets[2].data = state.history.map(h => h.sick);
        charts.healthTimeline.update();
    }
}

function setupDashboardCharts() {
    // Seed initial historical records (7 days to serve as lags for financial forecaster)
    state.history = [
        { day: 1, milk: 172.4, dailyProfit: 55.0, cumProfit: 250.0, healthy: 7, atRisk: 1, sick: 0, avgTemp: 38.5, avgStress: 4.1, avgDaysInMilk: 118 },
        { day: 2, milk: 178.6, dailyProfit: 58.2, cumProfit: 308.2, healthy: 7, atRisk: 1, sick: 0, avgTemp: 38.6, avgStress: 4.0, avgDaysInMilk: 119 },
        { day: 3, milk: 168.1, dailyProfit: 54.2, cumProfit: 362.4, healthy: 6, atRisk: 2, sick: 0, avgTemp: 38.7, avgStress: 4.5, avgDaysInMilk: 120 },
        { day: 4, milk: 185.3, dailyProfit: 65.7, cumProfit: 428.1, healthy: 7, atRisk: 1, sick: 0, avgTemp: 38.5, avgStress: 3.8, avgDaysInMilk: 121 },
        { day: 5, milk: 191.0, dailyProfit: 74.7, cumProfit: 502.8, healthy: 8, atRisk: 0, sick: 0, avgTemp: 38.4, avgStress: 3.5, avgDaysInMilk: 122 },
        { day: 6, milk: 180.2, dailyProfit: 60.5, cumProfit: 563.3, healthy: 7, atRisk: 0, sick: 1, avgTemp: 38.8, avgStress: 5.2, avgDaysInMilk: 123 },
        { day: 7, milk: 185.0, dailyProfit: 63.2, cumProfit: 626.5, healthy: 7, atRisk: 1, sick: 0, avgTemp: 38.6, avgStress: 4.3, avgDaysInMilk: 124 }
    ];

    state.day = 8;
    state.lifetimeProfit = 626.50;
    state.totalMilkCollected = 1260.6;

    document.getElementById('live-profit').textContent = state.lifetimeProfit.toFixed(2);
    document.getElementById('stat-total-milk').textContent = `${Math.floor(state.totalMilkCollected)} L`;

    setupTrendChart();
    setupMilkYieldChart();
    setupHealthTimelineChart();
    setupStressMilkScatter();
    updateHerdAverages();
}

function saveDailyHistory(milkToday, profitToday) {
    const healthCounts = getHerdHealthCounts();
    const avgs = getHerdBiometricAverages();

    state.history.push({
        day: state.day - 1,
        milk: Math.round(milkToday * 10) / 10,
        dailyProfit: Math.round(profitToday * 100) / 100,
        cumProfit: Math.round(state.lifetimeProfit * 100) / 100,
        healthy: healthCounts.healthy,
        atRisk: healthCounts.atRisk,
        sick: healthCounts.sick,
        avgTemp: Math.round(avgs.avgTemp * 10) / 10,
        avgStress: Math.round(avgs.avgStress * 10) / 10,
        avgDaysInMilk: Math.round(avgs.avgDaysInMilk)
    });

    state.herd.forEach(c => {
        if (!state.cowHistory[c.id]) state.cowHistory[c.id] = [];
        state.cowHistory[c.id].push({
            day: state.day - 1,
            health: c.healthStatus,
            milk: c.predictedMilk,
            stress: c.stressLevel,
            temp: c.bodyTemperatureC
        });
        if (state.cowHistory[c.id].length > 14) {
            state.cowHistory[c.id].shift();
        }
    });

    if (state.history.length > 14) {
        state.history.shift();
    }

    refreshHistoryCharts();
    refreshLiveCharts();
    updateHerdAverages();
}

/* ==========================================================================
   Interaction & Mouse Event Handlers
   ========================================================================== */
function onCanvasClick(event) {
    // Raycasting logic to pick cows
    if (event.target.tagName === 'BUTTON' || event.target.closest('#ui-container')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // Find intersections across all cow group structures
    const meshesToCheck = state.herd.map(c => c.mesh);
    const intersects = raycaster.intersectObjects(meshesToCheck, true);

    if (intersects.length > 0) {
        // Trace back up hierarchy to find the cowId stored in cowGroup.userData
        let targetGroup = intersects[0].object;
        while (targetGroup && !targetGroup.userData.cowId) {
            targetGroup = targetGroup.parent;
        }

        if (targetGroup && targetGroup.userData.cowId) {
            const clickedCow = state.herd.find(c => c.id === targetGroup.userData.cowId);
            if (event.ctrlKey || event.metaKey) {
                toggleComparisonCow(clickedCow);
                selectCow(clickedCow);
                return;
            }
            clearComparison();
            selectCow(clickedCow);
            return;
        }
    }

    // If click pasture without hitting a cow, close the sidebar
    deselectCow();
}

function selectCow(cow) {
    state.selectedCow = cow;
    
    // Open sidebar visual class
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('hidden');
    document.body.classList.add('sidebar-active');

    // Populate data
    updateSidebarData();
}

function deselectCow() {
    state.selectedCow = null;
    
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('hidden');
    document.body.classList.remove('sidebar-active');
}

function focusCameraOnSelectedCow() {
    if (!state.selectedCow) return;
    
    const cow = state.selectedCow;
    
    // Tween OrbitControls target to cow coordinates
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(cow.x, 1.0, cow.z);

    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(cow.x + 5, 4.0, cow.z + 5);

    const duration = 800; // ms
    const startTime = performance.now();

    function animateFocus(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        const easeVal = progress * (2 - progress); // Ease out quadratic

        controls.target.lerpVectors(startTarget, endTarget, easeVal);
        camera.position.lerpVectors(startPos, endPos, easeVal);
        controls.update();

        if (progress < 1.0) {
            requestAnimationFrame(animateFocus);
        }
    }
    requestAnimationFrame(animateFocus);
}

/* ==========================================================================
   UI Event Bindings Setup
   ========================================================================== */
function setupUIListeners() {
    // 1. Enter buttons
    document.getElementById('btn-start').addEventListener('click', () => {
        const overlay = document.getElementById('intro-overlay');
        overlay.classList.add('fade-out');
        state.isPaused = false;
    });

    // 2. Play/Pause
    const toggleTimeBtn = document.getElementById('btn-toggle-time');
    const playPauseIcon = document.getElementById('play-pause-icon');
    toggleTimeBtn.addEventListener('click', () => {
        state.isPaused = !state.isPaused;
        if (state.isPaused) {
            playPauseIcon.className = 'fa-solid fa-play';
            toggleTimeBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume Time';
        } else {
            playPauseIcon.className = 'fa-solid fa-pause';
            toggleTimeBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Time';
        }
    });

    // 3. Time Speed Slider
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        state.timeSpeed = speed / 10; // 10x is standard (value=10)
        speedVal.textContent = `${speed}x`;
    });

    // 4. Close Sidebar
    document.getElementById('btn-close-sidebar').addEventListener('click', deselectCow);

    // 5. Sidebar parameter updates
    document.getElementById('input-breed').addEventListener('change', (e) => {
        if (!state.selectedCow) return;
        state.selectedCow.breed = e.target.value;
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const ageRange = document.getElementById('input-age');
    ageRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseFloat(e.target.value);
        state.selectedCow.age = val;
        document.getElementById('val-age').textContent = val.toFixed(1);
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const weightRange = document.getElementById('input-weight');
    weightRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseInt(e.target.value);
        state.selectedCow.weight = val;
        document.getElementById('val-weight').textContent = val;
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const daysInMilkRange = document.getElementById('input-days-in-milk');
    daysInMilkRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseInt(e.target.value);
        state.selectedCow.daysInMilk = val;
        document.getElementById('val-days-in-milk').textContent = val;
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const stressRange = document.getElementById('input-stress');
    stressRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseFloat(e.target.value);
        state.selectedCow.stressLevel = val;
        document.getElementById('val-stress').textContent = val.toFixed(1);
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const milkDropRange = document.getElementById('input-milk-drop');
    milkDropRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseFloat(e.target.value);
        state.selectedCow.milkDropPercentage = val;
        document.getElementById('val-milk-drop').textContent = val.toFixed(1);
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const tempRange = document.getElementById('input-temp');
    tempRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseFloat(e.target.value);
        state.selectedCow.bodyTemperatureC = val;
        document.getElementById('val-temp').textContent = val.toFixed(1);
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const activityRange = document.getElementById('input-activity');
    activityRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseInt(e.target.value);
        state.selectedCow.activityLevel = val;
        document.getElementById('val-activity').textContent = val;
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    const daysHealthyRange = document.getElementById('input-days-healthy');
    daysHealthyRange.addEventListener('input', (e) => {
        if (!state.selectedCow) return;
        const val = parseInt(e.target.value);
        state.selectedCow.daysSinceLastHealthy = val;
        document.getElementById('val-days-healthy').textContent = val;
        state.selectedCow.recalculatePredictions();
        updateSidebarData();
        updateHerdStatsSummary();
    });

    // Center camera on cow
    document.getElementById('btn-focus-cow').addEventListener('click', focusCameraOnSelectedCow);

    // 6. Drawer Bottom Toggle
    const drawer = document.getElementById('dashboard-drawer');
    const toggleDrawerBtn = document.getElementById('btn-toggle-drawer');
    const drawerIcon = document.getElementById('drawer-icon');
    toggleDrawerBtn.addEventListener('click', () => {
        drawer.classList.toggle('collapsed');
        drawer.classList.toggle('open');
        
        if (drawer.classList.contains('open')) {
            drawerIcon.className = 'fa-solid fa-angle-down';
            toggleDrawerBtn.querySelector('span').textContent = 'Hide Farm Analytics';
        } else {
            drawerIcon.className = 'fa-solid fa-chart-line';
            toggleDrawerBtn.querySelector('span').textContent = 'Show Herd Performance Dashboard';
        }
    });

    // 7. Operation: Vaccinate Herd
    document.getElementById('btn-vaccinate-all').addEventListener('click', () => {
        if (state.lifetimeProfit < 100) {
            alert("Insufficient funds! Restoring herd health costs $100.");
            return;
        }
        
        state.lifetimeProfit -= 100;
        document.getElementById('live-profit').textContent = state.lifetimeProfit.toFixed(2);
        
        state.herd.forEach(cow => {
            // Give all cows a standard healthy baseline
            cow.healthStatus = 'Healthy';
            cow.bodyTemperatureC = 38.5;
            cow.stressLevel = 1.0;
            cow.activityLevel = 4500;
            cow.milkDropPercentage = 2.0;
            cow.daysSinceLastHealthy = 0;
            cow.recalculatePredictions();
        });

        alert("Herd fully vaccinated! All animal sickness cured, ages stabilized, and predictions updated.");
        
        updateHerdStatsSummary();
        if (state.selectedCow) updateSidebarData();
    });

    // 8. Operation: Upgrade Feed
    document.getElementById('btn-upgrade-feed').addEventListener('click', () => {
        state.herd.forEach(cow => {
            cow.feed = 'High-Protein Blend';
            cow.recalculatePredictions();
        });
        
        alert("Herd feed quality upgraded to High-Protein Blend. Expected milk outputs will scale!");
        
        updateHerdStatsSummary();
        if (state.selectedCow) updateSidebarData();
    });

    // 9. Operation: Reset Simulation
    document.getElementById('btn-reset-sim').addEventListener('click', () => {
        if (confirm("Reset simulation? This clears capital, history graphs, and restores initial conditions.")) {
            location.reload();
        }
    });

    document.getElementById('btn-refill-trough').addEventListener('click', refillTrough);
    document.getElementById('btn-refill-water').addEventListener('click', refillWater);

    document.getElementById('weather-select').addEventListener('change', (e) => {
        setWeather(e.target.value);
    });

    document.getElementById('btn-clear-compare').addEventListener('click', clearComparison);

    // 10. Simulate Day Fast Forward
    document.getElementById('btn-sim-day').addEventListener('click', () => {
        if (state.milkingActive) return;

        // Skip directly to collection time (18.0)
        if (state.timeOfDay < 18.0) {
            state.timeOfDay = 17.8;
        } else {
            // If it's already night, skip to dawn first
            state.timeOfDay = 17.8;
            state.day++;
            updateDayCounter();
        }
        
        state.isPaused = false;
        startMilkingPhase();
    });

    // Resize viewport handler
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ==========================================================================
   Initialization Setup
   ========================================================================== */
function init() {
    // 1. Create Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x7dd3fc, 0.008);

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(22, 14, 25);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Lock camera from going below pasture level
    controls.minDistance = 5;
    controls.maxDistance = 65;
    controls.target.set(0, 1.0, 0);

    // 5. Lights & Environment
    setupLighting();
    buildEnvironment();

    // 6. Instantiate 8 stylized cows in the herd
    for (let i = 0; i < NAMES.length; i++) {
        // Alternate breed and stats for diversity
        const breed = BREEDS[i % BREEDS.length];
        const age = Math.round((2.0 + Math.random() * 8.0) * 10) / 10;
        const weight = 500 + Math.floor(Math.random() * 250);
        const feed = FEEDS[i % FEEDS.length];
        const water = 40 + Math.floor(Math.random() * 60);

        const cow = new Cow(i + 1, NAMES[i], breed, age, weight, feed, water);
        state.herd.push(cow);
    }

    // 7. Hover cursor and raycasting logic
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    window.addEventListener('click', onCanvasClick);

    // Custom pointer hover styles on cows
    window.addEventListener('mousemove', (e) => {
        if (e.target.closest('#ui-container') || e.target.closest('#comparison-panel') || e.target.closest('#cow-tooltip')) {
            state.hoveredCow = null;
            updateCowTooltip(null);
            return;
        }
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        const hovered = raycastCowAtMouse();
        state.hoveredCow = hovered;
        updateCowTooltip(hovered);
        document.body.style.cursor = hovered ? 'pointer' : 'default';
    });

    // 8. Setup HTML UI widgets & Charts
    setupCowTooltip();
    setupUIListeners();
    setupDashboardCharts();
    updateTroughVisual();
    updateWaterVisual();
    updateWeatherUI();
    updateHerdStatsSummary();
    refreshLiveCharts();
    
    // Start clock in paused mode until intro screen starts
    state.isPaused = true;

    // 9. Begin main render frame animation loop
    requestAnimationFrame(animate);
}

/* ==========================================================================
   Main Game Frame Loop
   ========================================================================== */
function animate(now) {
    requestAnimationFrame(animate);

    // Frame delta calculation
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // Cap delta to prevent huge jumps when tab is unfocused
    if (dt > 0.1) dt = 0.1;

    // Update orbit controls
    controls.update();

    // Update sun/moon orbit lighting
    updateLightingCycle(dt);

    // Update cow animations & target wander logic
    state.herd.forEach(cow => cow.update(dt));

    // Update milking sequence progression
    updateMilkingSequence(dt);

    // Update hover tooltip position if visible
    if (state.hoveredCow) updateCowTooltip(state.hoveredCow);

    // Render WebGL
    renderer.render(scene, camera);
}

// Kickstart script on window loaded
window.onload = init;
