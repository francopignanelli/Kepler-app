/**
 * Material del globo: textura diurna (Blue Marble) siempre iluminada.
 * MeshBasicMaterial ignora las luces de la escena, así el planeta se ve
 * "prendido" parejo a toda hora. La nitidez en ángulos rasantes se mejora
 * con filtrado anisotrópico; para vista cercana entran los tiles de Esri.
 */

import * as THREE from "three";

const DAY_TEXTURE_URL = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";

export function createBrightGlobeMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0x888899 });
  new THREE.TextureLoader().load(DAY_TEXTURE_URL, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
  return material;
}
