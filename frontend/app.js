/* ==========================================================================
   AstroFarm Core Simulation Logic
   ========================================================================== */

// --- Global Constants & CDNs Checks ---
const BREEDS = ['Holstein', 'Jersey', 'Sahiwal', 'Cholistani'];
const NAMES = ['Daisy', 'Bessie', 'Molly', 'Bella', 'Lola', 'Lucy', 'Stella', 'Luna'];
const FEEDS = ['Standard Pasture', 'Alfalfa Concentrate', 'High-Protein Blend', 'Low-Cost Roughage'];

// --- Simulation State ---
const state = {
    herd: [],
    selectedCow: null,
    timeOfDay: 8.0, // 24-hour clock (8.0 = 8:00 AM)
    day: 1,
    timeSpeed: 1.0, // Multiplier for speed of time progression
    isPaused: false,
    milkingActive: false,
    milkingProgress: 0.0,
    totalMilkCollected: 0.0,
    lifetimeProfit: 250.00, // Starts with some investment capital
    dailyProfitDelta: 0.0,
    history: [], // Tracks daily stats for the dashboard graphs
    milkingStationPos: { x: -8, z: -5 },
    barnPos: { x: -12, z: -8 }
};

// --- Three.js Globals ---
let scene, camera, renderer, controls;
let sunLight, moonLight, ambientLight;
let sunOrb, moonOrb, starField;
let raycaster, mouse;
let lastTime = 0;
let labelContainer;

// --- Chart.js Globals ---
let trendChart = null;

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

    // Feed / Water inside trough
    const feedInsideMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 1.0 }); // Yellowish grains
    const feedLiquid = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.1, 1.0), feedInsideMat);
    feedLiquid.position.set(0, 0.75, 0);
    stationGroup.add(feedLiquid);

    // Signpost marker
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3d2314 });
    const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15), postMat);
    signPost.position.set(3.2, 1.0, 0);
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xef4444 })); // Red indicator
    signBoard.position.set(3.2, 1.7, 0);
    signBoard.rotation.y = Math.PI / 2;
    stationGroup.add(signPost, signBoard);

    scene.add(stationGroup);

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

        return cowGroup;
    }

    async recalculatePredictions() {
        try {
            // 1. Predict Health Status
            const healthResponse = await fetch('http://127.0.0.1:8000/predict/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    age: this.age,
                    milk_drop_percentage: this.milkDropPercentage,
                    body_temperature_c: this.bodyTemperatureC,
                    activity_level: this.activityLevel,
                    stress_level: this.stressLevel,
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
                    stress_level: this.stressLevel,
                    health_status: healthStatusNum
                })
            });
            const milkData = await milkResponse.json();
            this.predictedMilk = milkData.milk_yield;

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

            // Update UI floating text if label exists
            updateFloatingLabel(this);
            
            if (state.selectedCow === this) {
                updateSidebarData();
                updateHerdStatsSummary();
            }
        } catch (err) {
            console.error("API Fetch Error:", err);
        }
    }

    update(dt) {
        // --- Cow AI Wandering & Animations ---
        const speedMultiplier = (this.healthStatus === 'Healthy') ? 1.0 : (this.healthStatus === 'At-Risk' ? 0.45 : 0.08);
        const baseSpeed = 1.8;
        const speed = baseSpeed * speedMultiplier;

        if (this.state === 'milking') {
            // Milking: March cows towards Barn collection station
            const distToStation = Math.sqrt(Math.pow(state.milkingStationPos.x - this.x, 2) + Math.pow(state.milkingStationPos.z - this.z, 2));
            if (distToStation > 1.5) {
                // Move towards milking point
                const angle = Math.atan2(state.milkingStationPos.x - this.x, state.milkingStationPos.z - this.z);
                this.rotationY = angle;
                this.x += Math.sin(angle) * speed * dt;
                this.z += Math.cos(angle) * speed * dt;
                this.isIdle = false;
            } else {
                this.isIdle = true;
                // Look at trough
                this.rotationY = Math.PI / 2;
            }
        } else {
            // Wandering AI
            if (this.isIdle) {
                this.idleTimer -= dt;
                if (this.idleTimer <= 0) {
                    // Pick new target location
                    this.targetX = (Math.random() - 0.5) * 56;
                    this.targetZ = (Math.random() - 0.5) * 56;
                    
                    // Don't target too close to barn structures
                    while(this.targetX < -2 && this.targetZ < -2) {
                        this.targetX = (Math.random() - 0.5) * 56;
                        this.targetZ = (Math.random() - 0.5) * 56;
                    }

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
}

/* ==========================================================================
   UI Floating Labels & Dynamic Screen Projections
   ========================================================================== */
function setupFloatingLabels() {
    labelContainer = document.createElement('div');
    labelContainer.style.position = 'absolute';
    labelContainer.style.top = '0';
    labelContainer.style.left = '0';
    labelContainer.style.width = '100%';
    labelContainer.style.height = '100%';
    labelContainer.style.pointerEvents = 'none';
    labelContainer.style.overflow = 'hidden';
    labelContainer.style.zIndex = '5';
    document.body.appendChild(labelContainer);
}

function updateFloatingLabels() {
    const tempV = new THREE.Vector3();
    
    state.herd.forEach(cow => {
        let label = document.getElementById(`cow-label-${cow.id}`);
        if (!label) {
            label = document.createElement('div');
            label.id = `cow-label-${cow.id}`;
            label.className = `floating-cow-label healthy`;
            labelContainer.appendChild(label);
        }

        // Project 3D position above the cow body onto 2D screen coordinates
        tempV.copy(cow.mesh.position);
        tempV.y += 2.3; // Above head height
        
        // Check if point is behind camera
        tempV.project(camera);
        
        // Hide labels if camera is rotated away
        if (tempV.z > 1) {
            label.style.opacity = '0';
            return;
        }

        const x = (tempV.x *  .5 + .5) * window.innerWidth;
        const y = (tempV.y * -.5 + .5) * window.innerHeight;

        label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        label.style.opacity = '1';
        
        // Class styling based on health status
        label.className = `floating-cow-label ${cow.healthStatus.toLowerCase().replace('-', '')}`;
        label.innerHTML = `<i class="fa-solid fa-cow"></i> ${cow.name} (${cow.predictedMilk}L)`;
    });
}

function updateFloatingLabel(cow) {
    const label = document.getElementById(`cow-label-${cow.id}`);
    if (label) {
        label.innerHTML = `<i class="fa-solid fa-cow"></i> ${cow.name} (${cow.predictedMilk}L)`;
    }
}

/* ==========================================================================
   State & Predictions UI Updates
   ========================================================================== */
function updateDayCounter() {
    document.getElementById('day-counter').textContent = state.day.toString().padStart(2, '0');
    
    // Add current day summary to history data
    saveDailyHistory();
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

        // Refresh charts
        updateHerdStatsSummary();
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

/* ==========================================================================
   Chart.js Dashboard Setup and Tracking
   ========================================================================== */
function setupDashboardCharts() {
    const ctx = document.getElementById('herd-trend-chart').getContext('2d');
    
    // Seed initial historical records (7 days to serve as lags for financial forecaster)
    state.history = [
        { day: 1, milk: 172.4, dailyProfit: 55.0, cumProfit: 250.0 },
        { day: 2, milk: 178.6, dailyProfit: 58.2, cumProfit: 308.2 },
        { day: 3, milk: 168.1, dailyProfit: 54.2, cumProfit: 362.4 },
        { day: 4, milk: 185.3, dailyProfit: 65.7, cumProfit: 428.1 },
        { day: 5, milk: 191.0, dailyProfit: 74.7, cumProfit: 502.8 },
        { day: 6, milk: 180.2, dailyProfit: 60.5, cumProfit: 563.3 },
        { day: 7, milk: 185.0, dailyProfit: 63.2, cumProfit: 626.5 }
    ];

    state.day = 8;
    state.lifetimeProfit = 626.50;
    state.totalMilkCollected = 1260.6;

    document.getElementById('live-profit').textContent = state.lifetimeProfit.toFixed(2);
    document.getElementById('stat-total-milk').textContent = `${Math.floor(state.totalMilkCollected)} L`;

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: state.history.map(h => `Day ${h.day}`),
            datasets: [
                {
                    label: 'Herd Daily Milk (Liters)',
                    data: state.history.map(h => h.milk),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Net Profits Cumulative ($)',
                    data: state.history.map(h => h.cumProfit),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 2.5,
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
                legend: {
                    labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { family: 'Inter' } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#10b981', font: { family: 'Inter' } },
                    title: { display: true, text: 'Milk Output (Liters)', color: '#10b981' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }, // Only show left y-axis grids
                    ticks: { color: '#3b82f6', font: { family: 'Inter' } },
                    title: { display: true, text: 'Total Net Capital ($)', color: '#3b82f6' }
                }
            }
        }
    });
}

function saveDailyHistory(milkToday, profitToday) {
    // Save history point
    state.history.push({
        day: state.day - 1,
        milk: Math.round(milkToday * 10) / 10,
        dailyProfit: Math.round(profitToday * 100) / 100,
        cumProfit: Math.round(state.lifetimeProfit * 100) / 100
    });

    // Limit array size to 10 points
    if (state.history.length > 10) {
        state.history.shift();
    }

    // Refresh charts
    if (trendChart) {
        trendChart.data.labels = state.history.map(h => `Day ${h.day}`);
        trendChart.data.datasets[0].data = state.history.map(h => h.milk);
        trendChart.data.datasets[1].data = state.history.map(h => h.cumProfit);
        trendChart.update();
    }
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
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        const meshesToCheck = state.herd.map(c => c.mesh);
        const intersects = raycaster.intersectObjects(meshesToCheck, true);
        
        if (intersects.length > 0) {
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }
    });

    // 8. Setup HTML UI widgets & Charts
    setupFloatingLabels();
    setupUIListeners();
    setupDashboardCharts();
    updateHerdStatsSummary();
    
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

    // Update HTML overlay labels
    updateFloatingLabels();

    // Render WebGL
    renderer.render(scene, camera);
}

// Kickstart script on window loaded
window.onload = init;
