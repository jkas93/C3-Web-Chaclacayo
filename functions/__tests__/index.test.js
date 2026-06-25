const test = require('firebase-functions-test')();
const myFunctions = require('../index.js');

describe('Cloud Functions Utilities', () => {
  it('calculateDistance should compute correct distance', () => {
    // Lima coordinates roughly
    const lat1 = -12.0464;
    const lon1 = -77.0428;
    const lat2 = -11.9765; // Chaclacayo roughly
    const lon2 = -76.7725;
    
    const distance = myFunctions.calculateDistance(lat1, lon1, lat2, lon2);
    expect(distance).toBeGreaterThan(0);
    expect(typeof distance).toBe('number');
  });

  it('getLabelServicio should return correct labels', () => {
    expect(myFunctions.getLabelServicio('POLICIA').emoji).toBe('🚔');
    expect(myFunctions.getLabelServicio('BOMBEROS').emoji).toBe('🚒');
    expect(myFunctions.getLabelServicio('SALUD').emoji).toBe('🚑');
    expect(myFunctions.getLabelServicio('UNKNOWN').emoji).toBe('🚨');
  });
});
