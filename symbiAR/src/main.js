import * as THREE from "three";
import * as LocAR from "locar";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Request device orientation permission for iOS
async function requestDeviceOrientation() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') {
        console.error('Device orientation permission not granted');
      }
    } catch (error) {
      console.error('Error requesting device orientation permission:', error);
    }
  }
}

// Setup scene, camera, and renderer
const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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

// Store model data
const models = new Map();

// Constants
const ANIMATION_SPEED = 0.1;
const DISTANCE_MULTIPLIER = 0.8;
const HEIGHT_OFFSET = 0;
const MODEL_SCALE = 2.0; // Adjust this based on your model size

let firstLocation = true;
let deviceOrientationControls;

// Load 3D models
const loader = new GLTFLoader();
const modelURLs = [
  './mungee.glb',  // Replace with your model URLs
  './mungee.glb',
  './mungee.glb',
  './mungee.glb'
];

// Create models at initial GPS location
locar.on("gpsupdate", (pos) => {
  if (firstLocation) {
    const modelProps = [
      { latDis: 0.001 * DISTANCE_MULTIPLIER, lonDis: 0, modelIndex: 0 },
      { latDis: -0.001 * DISTANCE_MULTIPLIER, lonDis: 0, modelIndex: 1 },
      { latDis: 0, lonDis: -0.001 * DISTANCE_MULTIPLIER, modelIndex: 2 },
      { latDis: 0, lonDis: 0.001 * DISTANCE_MULTIPLIER, modelIndex: 3 },
    ];

    modelProps.forEach(({ latDis, lonDis, modelIndex }) => {
      loader.load(
        modelURLs[modelIndex],
        (gltf) => {
          const model = gltf.scene;
          
          // Scale and configure the model
          model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
          model.traverse((node) => {
            if (node.isMesh) {
              node.material.transparent = true;
              node.material.opacity = 0.8;
              node.material.depthTest = false;
            }
          });

          locar.add(
            model,
            pos.coords.longitude + lonDis * 0.5,
            pos.coords.latitude + latDis * 0.5,
            HEIGHT_OFFSET
          );

          // Debug logging
          console.log('Model added at:', {
            longitude: pos.coords.longitude + lonDis * 0.5,
            latitude: pos.coords.latitude + latDis * 0.5,
            height: HEIGHT_OFFSET,
            worldPosition: model.position.clone()
          });

          models.set(model, {
            originalPosition: model.position.clone(),
            originalScale: model.scale.clone(),
            originalRotation: model.rotation.clone(),
            lastHoverTime: 0,
          });

          model.renderOrder = 1;
        },
        (progress) => {
          console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
          console.error('Error loading model:', error);
        }
      );
    });

    firstLocation = false;
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
    const isHovered = intersects.length > 0 && 
      (intersects[0].object === model || intersects[0].object.parent === model);

    if (isHovered) {
      // Bring model forward for inspection
      const forwardVector = new THREE.Vector3();
      camera.getWorldDirection(forwardVector);
      forwardVector.multiplyScalar(20);

      const targetPosition = camera.position.clone().add(forwardVector);
      model.position.lerp(targetPosition, ANIMATION_SPEED);
      
      // Add some rotation animation when hovered
      model.rotation.y += 0.01;
    } else {
      // Return to original position and rotation
      model.position.lerp(data.originalPosition, ANIMATION_SPEED);
      model.scale.lerp(data.originalScale, ANIMATION_SPEED);
      model.rotation.setFromVector3(data.originalRotation);
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
const startButton = document.createElement('button');
startButton.innerHTML = 'Start AR';
startButton.style.position = 'fixed';
startButton.style.top = '50%';
startButton.style.left = '50%';
startButton.style.transform = 'translate(-50%, -50%)';
startButton.style.zIndex = '1000';
startButton.style.padding = '12px 24px';
startButton.style.fontSize = '18px';
startButton.style.backgroundColor = '#4CAF50';
startButton.style.color = 'white';
startButton.style.border = 'none';
startButton.style.borderRadius = '4px';
startButton.style.cursor = 'pointer';
document.body.appendChild(startButton);

startButton.addEventListener('click', async () => {
  await initAR();
  startButton.style.display = 'none';
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

// Add debug info
const debugDiv = document.createElement("div");
debugDiv.style.position = "fixed";
debugDiv.style.top = "10px";
debugDiv.style.left = "10px";
debugDiv.style.color = "white";
debugDiv.style.backgroundColor = "rgba(0,0,0,0.5)";
debugDiv.style.padding = "10px";
debugDiv.style.fontFamily = "monospace";
document.body.appendChild(debugDiv);

// Add loading indicator
const loadingDiv = document.createElement("div");
loadingDiv.style.position = "fixed";
loadingDiv.style.top = "50%";
loadingDiv.style.left = "50%";
loadingDiv.style.transform = "translate(-50%, -50%)";
loadingDiv.style.color = "white";
loadingDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
loadingDiv.style.padding = "20px";
loadingDiv.style.borderRadius = "10px";
loadingDiv.style.display = "none";
document.body.appendChild(loadingDiv);

// Update debug info every frame
setInterval(() => {
  const modelArray = Array.from(models.keys());
  const intersects = raycaster.intersectObjects(modelArray, true);
  debugDiv.innerHTML = `
    Device: ${/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iOS' : 'Other'}<br>
    Orientation: ${screen.orientation?.type || 'N/A'}<br>
    Models in scene: ${modelArray.length}<br>
    Raycast hits: ${intersects.length}<br>
    ${intersects.length > 0 ? `Hit distance: ${intersects[0].distance.toFixed(2)}` : "No hits"}<br>
    Camera position: ${camera.position.toArray().map((v) => v.toFixed(2)).join(", ")}<br>
    Camera rotation: ${camera.rotation.toArray().map(v => v.toFixed(2)).join(', ')}
  `;
}, 100);