import { describe, expect, it } from 'vitest';
import { generateFlyoverHtml } from './flyoverHtmlGenerator';

describe('generateFlyoverHtml', () => {
  it('generates a valid HTML string and full flight engine executes without errors', () => {
    const html = generateFlyoverHtml({
      points: [
        { latitude: 12.9716, longitude: 77.5946, altitude: 920 },
        { latitude: 12.9720, longitude: 77.5950, altitude: 922 },
        { latitude: 12.9730, longitude: 77.5960, altitude: 925 },
        { latitude: 12.9740, longitude: 77.5970, altitude: 930 },
      ],
      title: 'Morning 5K Run',
      totalDistanceMeters: 5000,
      totalDurationSeconds: 1500,
      elevationGainMeters: 45,
      initialStyle: 'satellite',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('maplibre-gl.js');
    expect(html).toContain('runner-avatar-wrapper');

    const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const scriptCode = scriptMatches.map(m => m[1]).join('\n');

    let renderedCoordinates: any[] = [];
    let mapJumped = false;
    let markerMoved = false;

    const mockSource = {
      setData: (data: any) => {
        if (data?.geometry?.coordinates) {
          renderedCoordinates = data.geometry.coordinates;
        }
      },
    };

    const mockMap: any = {
      on: (event: string, cb: Function) => {
        if (event === 'load') cb();
      },
      once: (event: string, cb: Function) => cb(),
      getSource: (name: string) => mockSource,
      addSource: () => {},
      addLayer: () => {},
      setTerrain: () => {},
      setStyle: () => {},
      jumpTo: (opts: any) => {
        mapJumped = true;
      },
      easeTo: () => {},
      flyTo: () => {},
      queryTerrainElevation: () => 920,
      getCanvas: () => ({ captureStream: () => {} }),
    };

    const mockMarker = {
      setLngLat: () => {
        markerMoved = true;
        return mockMarker;
      },
      addTo: () => mockMarker,
    };

    const postedMessages: any[] = [];
    let rafCount = 0;
    const mockWindow: any = {
      ReactNativeWebView: {
        postMessage: (msg: string) => postedMessages.push(JSON.parse(msg)),
      },
      addEventListener: () => {},
      requestAnimationFrame: (cb: Function) => {
        if (rafCount++ < 3) {
          cb(Date.now() + rafCount * 16);
        }
        return rafCount;
      },
      cancelAnimationFrame: () => {},
    };

    const mockDoc: any = {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({
        style: {},
        className: '',
        innerText: '',
      }),
    };

    const mockMapLibre: any = {
      Map: function() { return mockMap; },
      Marker: function() { return mockMarker; },
    };

    const runner = new Function('window', 'document', 'maplibregl', scriptCode);
    expect(() => runner(mockWindow, mockDoc, mockMapLibre)).not.toThrow();

    // Verify controls exist on window
    expect(mockWindow.FlyoverControls).toBeDefined();

    // Test Play
    mockWindow.FlyoverControls.play();
    expect(mapJumped).toBe(true);
    expect(markerMoved).toBe(true);
    expect(renderedCoordinates.length).toBeGreaterThanOrEqual(2);

    // Test Seek
    mockWindow.FlyoverControls.seek(0.5);
    expect(renderedCoordinates.length).toBeGreaterThanOrEqual(2);

    // Test Restart
    mockWindow.FlyoverControls.restart();

    // Test Style switch
    mockWindow.FlyoverControls.setStyle('dark');
  });
});
