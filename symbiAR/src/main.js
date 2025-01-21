import * as THREE from "three";
import * as LocAR from "locar";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

const fontLoader = new FontLoader();
fontLoader.load(
  "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
  (font) => {
    // South text
    const textGeometry = new TextGeometry("WELCOME TO LOCATION-BASED AR", {
      font: font,
      size: 2, // Adjust size as needed
      height: 0.2, // Depth of the text
      curveSegments: 12, // Smoothing
    });

    const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);

    // Position the text north relative to the scene
    textMesh.position.set(0, 0, -50); // Adjust Z position as needed
    textMesh.rotation.y = 0; // Face north (0 degrees)

    scene.add(textMesh);

    // West text
    const westTextGeometry = new TextGeometry("THANK YOU FOR INTERACTING", {
      font: font,
      size: 2, // Adjust size as needed
      height: 0.2, // Depth of the text
      curveSegments: 12, // Smoothing
    });

    const westTextMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const westTextMesh = new THREE.Mesh(westTextGeometry, westTextMaterial);

    // Position the text west relative to the scene
    westTextMesh.position.set(-50, 0, 0); // Adjust X position for west
    westTextMesh.rotation.y = 90; // Face west (90 degrees)

    scene.add(westTextMesh);
  },
);

// Request device orientation permission for iOS
async function requestDeviceOrientation() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        console.error("Device orientation permission not granted");
      }
    } catch (error) {
      console.error("Error requesting device orientation permission:", error);
    }
  }
}

// Setup scene, camera, and renderer
const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const locar = new LocAR.LocationBased(scene, camera);

// Handle window resizing
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// Setup webcam renderer
const cam = new LocAR.WebcamRenderer(renderer);

// Raycaster setup
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// Center crosshair
const crosshairGeometry = new THREE.RingGeometry(0.02, 0.03, 32);
const crosshairMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
});
const crosshair = new THREE.Mesh(crosshairGeometry, crosshairMaterial);
crosshair.position.z = -1;
camera.add(crosshair);
scene.add(camera);

// Store model instances
const models = new Map();

// Load 3D model
const loader = new GLTFLoader();
let modelTemplate; // Will store the loaded model to clone from

// Constants
const ANIMATION_SPEED = 0.1;
const DISTANCE_MULTIPLIER = 0.8;
const HEIGHT_OFFSET = 0;
const MODEL_SCALE = 5; // Adjust this based on your model size

let firstLocation = true;
let deviceOrientationControls;

// Add Lighting
const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Bright white light
directionalLight.position.set(5, 10, 5); // Position the light from the top
directionalLight.castShadow = true; // Enable shadows for this light
scene.add(directionalLight);

// Set up shadow properties for the light
directionalLight.shadow.mapSize.width = 1024; // Shadow resolution
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;

// Load the model before creating instances
loader.load(
  "/rblock.glb",
  (gltf) => {
    console.log("Model loaded successfully:", gltf);
    modelTemplate = gltf.scene;

    // Enable shadows for the model
    modelTemplate.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; // Model casts shadows
        child.receiveShadow = true; // Model receives shadows
      }
    });

    // Log model details
    console.log("Model hierarchy:", gltf.scene);
    gltf.scene.traverse((child) => {
      console.log("Model child:", child.type, child.name);
    });

    // Make sure model is visible and properly scaled
    modelTemplate.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

    console.log("Model template prepared");

    // If GPS is already available, create models
    if (firstLocation) {
      const pos = locar.getCurrentPosition();
      if (pos) {
        createModels(pos);
      }
    }
  },
  (progress) => {
    console.log(
      "Loading progress:",
      ((progress.loaded / progress.total) * 100).toFixed(2) + "%",
    );
  },
  (error) => {
    console.error("Error loading model:", error);
  },
);

// Separate function to create models
function createModels(pos) {
  const modelProps = [
    { latDis: 0 * DISTANCE_MULTIPLIER, lonDis: 0-0.001, color: 0xffffff },
  ];

  modelProps.forEach(({ latDis, lonDis, color }) => {
    const modelInstance = modelTemplate.clone();

    modelInstance.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color.setHex(color);
        child.material.transparent = true;
        child.material.opacity = 0.8;
        child.material.depthTest = true;
        child.geometry.computeBoundingBox(); // Ensure bounding box is calculated
        child.geometry.computeBoundingSphere(); // Ensure bounding sphere is calculated
      }
    });

    const longitude = pos.coords.longitude + lonDis * 0.5;
    const latitude = pos.coords.latitude + latDis * 0.5;

    locar.add(modelInstance, longitude, latitude, HEIGHT_OFFSET);

    console.log("Model instance added:", {
      longitude,
      latitude,
      height: HEIGHT_OFFSET,
      color: color.toString(16),
      worldPosition: modelInstance.position.toArray(),
    });

    models.set(modelInstance, {
      originalPosition: modelInstance.position.clone(),
      originalScale: modelInstance.scale.clone(),
      originalColor: color,
      lastHoverTime: 0,
    });

    modelInstance.renderOrder = 1;
  });

  firstLocation = false;
}

// Create models at initial GPS location
locar.on("gpsupdate", (pos) => {
  if (firstLocation && modelTemplate) {
    createModels(pos);
  }
});

function updateModels() {
  // Update raycaster
  pointer.set(0, 0);
  raycaster.setFromCamera(pointer, camera);

  const modelArray = Array.from(models.keys());
  const intersects = raycaster.intersectObjects(modelArray, true);

  modelArray.forEach((model) => {
    const data = models.get(model);
    const isHovered =
      intersects.length > 0 &&
      (intersects[0].object === model || intersects[0].object.parent === model);

    if (isHovered) {
      // Bring models forward for inspection
      const forwardVector = new THREE.Vector3();
      camera.getWorldDirection(forwardVector);
      forwardVector.multiplyScalar(20);

      const targetPosition = camera.position.clone().add(forwardVector);
      model.position.lerp(targetPosition, ANIMATION_SPEED);
    } else {
      // Return to original position
      model.position.lerp(data.originalPosition, ANIMATION_SPEED);
      model.scale.lerp(data.originalScale, ANIMATION_SPEED);
      model.traverse((child) => {
        if (child.isMesh) {
          child.material.color.setHex(data.originalColor);
        }
      });
    }
  });
}

// Initialize AR
async function initAR() {
  await requestDeviceOrientation();
  deviceOrientationControls = new LocAR.DeviceOrientationControls(camera);
  locar.startGps();
}

// Create start button
const startButton = document.createElement("button");
startButton.innerHTML = "Start Experience";
startButton.style.position = "fixed";
startButton.style.top = "50%";
startButton.style.left = "50%";
startButton.style.transform = "translate(-50%, -50%)";
startButton.style.zIndex = "1000";
startButton.style.padding = "24px 48px";
startButton.style.fontSize = "32px";
startButton.style.backgroundColor = "#4CAF50";
startButton.style.color = "white";
startButton.style.border = "none";
startButton.style.borderRadius = "4px";
startButton.style.cursor = "pointer";
document.body.appendChild(startButton);

startButton.addEventListener("click", async () => {
  await initAR();
  startButton.style.display = "none";
});

// Animation loop
renderer.setAnimationLoop(() => {
  cam.update();
  if (deviceOrientationControls) {
    deviceOrientationControls.update();
  }
  updateModels();
  renderer.render(scene, camera);
});