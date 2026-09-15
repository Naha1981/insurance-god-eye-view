import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

const repairCesiumRectangleExpansion = () => ({
  name: 'claimtrace-repair-rectangle-expansion',
  enforce: 'post',
  transform(code, id) {
    if (!id.endsWith('/src/main.js') && !id.endsWith('\\src\\main.js')) return null;
    const brokenCall = 'Cesium.Rectangle.expand(sceneRectangle, 0.006)';
    if (!code.includes(brokenCall)) return null;
    const helper = `\nconst expandSceneRectangle = (rectangle, paddingDegrees = 0.006) => {\n  const padding = Cesium.Math.toRadians(paddingDegrees);\n  return new Cesium.Rectangle(\n    rectangle.west - padding,\n    rectangle.south - padding,\n    rectangle.east + padding,\n    rectangle.north + padding,\n  );\n};\n`;
    const transformed = code
      .replace(brokenCall, 'expandSceneRectangle(sceneRectangle)')
      .replace('let viewer = null;', `${helper}\nlet viewer = null;`);
    return { code: transformed, map: null };
  },
});

export default defineConfig({
  plugins: [cesium(), repairCesiumRectangleExpansion()],
  server: {
    port: 4173,
    strictPort: true,
  },
});
