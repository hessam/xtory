import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Marker, Pane, useMap, useMapEvents } from 'react-leaflet';
import { GeoJsonObject, Feature } from 'geojson';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import regionsGeoJSON from '../data/regions.json';
import iranModernGeoJSON from '../data/iran_modern.json';
import achaemenidMaxGeoJSON from '../data/achaemenid_max.json';
import sasanianMaxGeoJSON from '../data/sasanian_max.json';
import { regions, RegionId, EraRole } from '../data/regions';
import { getEraForYear } from '../services/geminiService';
import { ReignEvent } from '../data/events';
import { Ruler } from '../data/rulers';
import { Dynasty } from '../data/dynasties';
import { HistoricalEvent } from '../data/historicalEvents';
import { Artifact } from '../data/artifacts';
import { Vazir } from '../data/vazirs';
import { pushToDataLayer } from '../services/tagManager';
import { MapFilters } from './MapFilters';
import { Sparkles, Swords, Skull, Landmark, Globe2, Building2, Book, ZoomIn, ZoomOut, Maximize, X, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mapPolygons, ZOOM_ANCHOR_CITIES, ZOOM_ALL_CITIES } from '../data/mapPolygons';
import { isFlagOn } from '../lib/flags';
import { useLens, toggleLens } from '../lib/lensStore';
import { getDynasty, getRealmsByRegion, RELATION_EXTENT } from '../data/registry';
import { FragmentationHud } from './fragmentation/FragmentationHud';

interface MapLeafletProps {
  year: number;
  lang: 'en' | 'fa';
  onRegionClick: (regionId: string) => void;
  onGlobalContextClick?: (year: number) => void;
  events: ReignEvent[];
  rulers: Record<string, Ruler>;
  dynasties: Record<string, Dynasty>;
  historicalEvents?: HistoricalEvent[];
  artifacts?: Artifact[];
  vazirs?: Vazir[];
  onHistoricalEventClick?: (event: HistoricalEvent) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  onVazirClick?: (vazir: Vazir) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CENTER_LAT_LNG: [number, number] = [32, 53];
const DEFAULT_ZOOM = 5;
const MIN_ZOOM = 4;
const MAX_ZOOM = 8;

// Bounds: South KSA → Top of Caspian, Turkey → East Afghanistan
// Prevents tile loading outside the Greater Iran focus area
const MAP_BOUNDS: L.LatLngBoundsExpression = [
  [10, 24],   // SW corner (south KSA + padding, west Turkey + padding)
  [45, 77],   // NE corner (top Caspian + padding, east Afghanistan + padding)
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDynastyColor(dynasty: Dynasty): string {
  if (dynasty.colorFamily === 'persian') return '#a855f7';
  if (dynasty.colorFamily === 'arab') return '#10b981';
  if (dynasty.colorFamily === 'turkic') return '#ea580c';
  if (dynasty.colorFamily === 'greek') return '#0ea5e9';
  if (dynasty.colorFamily === 'nomadic') return '#b45309';
  if (dynasty.colorFamily === 'foreign') return '#e11d48';
  if (dynasty.colorFamily === 'semitic') return '#78350f';
  return '#ffffff';
}

// Deprecated: pixelToLatLng removed since all points are purely geographic now

const getEventIcon = (type: string) => {
  switch (type) {
    case 'battle': return <Swords className="w-4 h-4 text-rose-400" />;
    case 'downfall': return <Skull className="w-4 h-4 text-purple-400" />;
    case 'political': return <Landmark className="w-4 h-4 text-sky-400" />;
    case 'cultural': return <Globe2 className="w-4 h-4 text-emerald-400" />;
    default: return <Sparkles className="w-4 h-4 text-amber-400" />;
  }
};

const getArtifactIcon = (type: string) => {
  switch (type) {
    case 'monument': return <Building2 className="w-4 h-4 text-amber-400" />;
    case 'architecture': return <Landmark className="w-4 h-4 text-sky-400" />;
    case 'manuscript': return <Book className="w-4 h-4 text-purple-400" />;
    default: return <Sparkles className="w-4 h-4 text-emerald-400" />;
  }
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute top-1/2 -translate-y-1/2 right-4 sm:right-auto sm:left-6 z-[1000] flex flex-col gap-1.5 sm:gap-2 liquid-glass p-1.5 sm:p-2 rounded-xl sm:rounded-2xl calm-transition border border-white/5">
      <button onClick={() => map.zoomIn()} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all" title="Zoom In"><ZoomIn className="w-5 h-5 group-hover:scale-110 calm-transition" /></button>
      <button onClick={() => map.zoomOut()} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all border-y border-white/5" title="Zoom Out"><ZoomOut className="w-5 h-5 group-hover:scale-110 calm-transition" /></button>
      <button onClick={() => map.setView(CENTER_LAT_LNG, DEFAULT_ZOOM)} className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl group transition-all" title="Reset View"><Maximize className="w-5 h-5 group-hover:scale-110 calm-transition" /></button>
    </div>
  );
}

function MapEventsHandler({ onRegionClick, onZoomChange }: { onRegionClick: (id: string | null) => void, onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    click: () => onRegionClick(null),
    zoomend: () => onZoomChange(map.getZoom())
  });
  return null;
}

export default function MapLeaflet(props: MapLeafletProps) {
  const { year, lang, onRegionClick, events, rulers, dynasties, historicalEvents = [], artifacts = [], vazirs = [], onHistoricalEventClick, onArtifactClick, onVazirClick } = props;
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showLegend, setShowLegend] = useState(false);
  // ff_fragmentation: per-dynasty colours, concurrent-realm chips, counter and reach lens (Slice 2)
  const fragOn = useMemo(() => isFlagOn('fragmentation'), []);
  const lens = useLens();
  const realmsByRegion = useMemo(() => (fragOn ? getRealmsByRegion(year) : null), [fragOn, year]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const ZOOM_CITY_TIER1 = isMobile ? 5 : 6;
  const ZOOM_CITY_TIER2 = isMobile ? 6 : 7;
  const ZOOM_CITY_TIER3 = isMobile ? 7 : 8;

  const activeEvents = useMemo(() => events.filter(e => year >= e.startDate && year <= e.endDate), [events, year]);
  const activeHistoricalEvents = useMemo(() => historicalEvents.filter(e => Math.abs(e.year - year) <= 25 && e.coordinates).map(e => ({ ...e, latLng: e.coordinates as [number, number] })), [historicalEvents, year]);
  const activeArtifacts = useMemo(() => artifacts.filter(a => Math.abs(a.year - year) <= 100 && a.coordinates).map(a => ({ ...a, latLng: a.coordinates as [number, number] })), [artifacts, year]);
  const activeVazirs = useMemo(() => {
    return vazirs
      .filter(v => year >= v.activeYearStart && year <= v.activeYearEnd)
      .map(v => {
        const poly = regions.find(p => p.id === v.regionId);
        const centerLatLng = poly?.centroid ? [poly.centroid.lat, poly.centroid.lng] as [number, number] : [32, 53] as [number, number];
        return { ...v, latLng: centerLatLng };
      });
  }, [vazirs, year]);

  const activeRulerCapitals = useMemo(() => {
    return activeEvents.map(event => {
      if (!event.capitalCityEn) return null;
      // find coordinates: check all regions to be safe (AI might put city in wrong id region)
      const allAnchorCities = regions.flatMap(r => r.anchorCities);
      const normalizedQuery = event.capitalCityEn.toLowerCase().split('(')[0].trim();
      const city = allAnchorCities.find(c => {
         const nameMatch = c.name.toLowerCase().includes(normalizedQuery);
         const histMatch = c.historicalNames?.some(h => h.toLowerCase().includes(normalizedQuery));
         return nameMatch || histMatch;
      });
      
      if (!city) return null;
      
      const ruler = rulers[event.rulerId];
      if (!ruler) return null;
      const dynasty = dynasties[ruler.dynastyId];
      const color = dynasty ? getDynastyColor(dynasty) : '#ffffff';

      return {
        id: event.id,
        latLng: [city.lat, city.lng] as [number, number],
        name: { en: event.capitalCityEn, fa: event.capitalCityFa || event.capitalCityEn },
        color,
        regionId: event.regionId
      };
    }).filter(Boolean);
  }, [activeEvents, rulers, dynasties]);

  const [neighboursGeoJSON, setNeighboursGeoJSON] = useState<any>(null);
  useEffect(() => {
    // Load neighbour boundaries after a short delay to prioritize critical map visual loading
    const t = setTimeout(() => {
      import('../data/neighbours.json').then(m => setNeighboursGeoJSON(m.default));
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // Pre-calculate neighbor centroids to avoid turf.centerOfMass in render loop
  const neighborMarkers = useMemo(() => {
    if (!neighboursGeoJSON) return [];
    return (neighboursGeoJSON as any).features.map((feat: any) => {
      const centroid = turf.centerOfMass(feat).geometry.coordinates;
      return {
        id: feat.properties.id,
        position: [centroid[1], centroid[0]] as [number, number],
        name: feat.properties.name,
        nameFa: feat.properties.nameFa
      };
    });
  }, [neighboursGeoJSON]);

  const allCities = useMemo(() => {
    return regions.flatMap(r => (r.anchorCities || []).map((c, i) => ({
      id: c.name.toLowerCase().replace(/\s+/g, '_'),
      name: { en: c.name, fa: c.nameFa },
      regionId: r.id,
      latLng: [c.lat, c.lng] as [number, number],
      tier: i === 0 ? 1 : i === 1 ? 2 : 3
    })));
  }, []);

  const currentEra = useMemo(() => getEraForYear(year), [year]);

  const getControlExtent = (role?: EraRole): number => {
    if (!role) return 0;
    const ROLE_TO_EXTENT: Record<EraRole, number> = {
      heartland: 1.0,
      province: 0.7,
      frontier: 0.35,
      contested: 0.2,
      nominal: 0.15,
      independent: 0.1,
    };
    return ROLE_TO_EXTENT[role];
  };
  const getRegionEvents = (regionId: string) => {
    const events = activeEvents.filter(e => e.regionId === regionId);
    const staticEvents = events.filter(e => !e.isAiGenerated);
    // If we have authoritative static data for this year, ignore AI fallbacks to prevent collisions
    return staticEvents.length > 0 ? staticEvents : events;
  };

  const activeRegionIds = useMemo(() => {
    if (!regionsGeoJSON) return new Set<string>();
    return new Set<string>((regionsGeoJSON as any).features.map((f: any) => f.properties.id));
  }, [regionsGeoJSON]);

  const styleRegion = React.useCallback((feature: any) => {
    const regionId = feature.properties.id as RegionId;

    // ── Fragmentation mode: the curated registry decides colour (one per dynasty) ──
    const fragRealms = realmsByRegion?.get(regionId);
    if (fragRealms && fragRealms.length > 0) {
      if (lens) {
        const held = fragRealms.find(r => r.dynastyId === lens);
        if (!held) {
          return { fillColor: '#64748b', color: '#64748b', weight: 0.5, fillOpacity: 0.04, opacity: 0.2, className: 'region-polygon transition-all duration-700' };
        }
        const c = getDynasty(lens)?.color ?? '#ffffff';
        return { fillColor: c, color: c, weight: isMobile ? 1.5 : 2.5, fillOpacity: 0.3 + RELATION_EXTENT[held.relation] * 0.35, opacity: 0.95, className: 'region-polygon transition-all duration-700' };
      }
      const top = fragRealms[0];
      const c = getDynasty(top.dynastyId)?.color ?? '#ffffff';
      const ext = RELATION_EXTENT[top.relation] * (top.confidence === 'low' ? 0.8 : 1);
      const base = isMobile ? (currentZoom <= 5 ? 0.8 : 1.25) : 2.0;
      return {
        fillColor: c, color: c,
        weight: ext < 0.3 ? Math.min(1, base * 0.5) : ext * base,
        fillOpacity: 0.08 + ext * 0.52,
        opacity: ext * 0.9,
        className: `region-polygon transition-all duration-1000 ${ext < 0.3 ? 'breathing-border' : ''}`,
      };
    }

    const regionEvents = getRegionEvents(regionId);
    
    // ── FALLBACK: Use static eraPresence if no ruler data exists ──
    if (!regionEvents || regionEvents.length === 0) {
      const regionData = regions.find(r => r.id === regionId);
      const role = regionData?.eraPresence[currentEra.id];
      const extent = getControlExtent(role);
      
      if (extent === 0) {
        return { fillColor: 'transparent', color: 'rgba(255, 255, 255, 0.04)', weight: 0.5, fillOpacity: 0, opacity: 0.2, className: 'calm-transition' };
      }
      
      return {
        fillColor: '#ffffff', // Neutral tint for historical presence without specific ruler data
        color: 'rgba(255, 255, 255, 0.2)',
        weight: extent < 0.3 ? 1 : (extent * 1.5),
        fillOpacity: 0.05 + (extent * 0.15), // Very subtle fallback
        opacity: extent * 0.4,
        className: `region-polygon transition-all duration-1000 ${extent < 0.3 ? 'breathing-border' : ''}`
      };
    }

    const primaryEvent = regionEvents.find(e => e.status === 'Direct Control') || regionEvents[0];
    const ruler = rulers[primaryEvent.rulerId];
    if (!ruler) return { fillColor: 'transparent', color: 'transparent', weight: 0, fillOpacity: 0 };
    const dynasty = dynasties[ruler.dynastyId];
    const color = dynasty ? getDynastyColor(dynasty) : '#ffffff';
    const STATUS_EXTENT: Record<string, number> = {
      'Direct Control': 0.9,
      'Partial Control': 0.7,
      'Vassal State': 0.55,
      'Sphere of Influence': 0.25,
      'Contested/Warzone': 0.15,
    };
    
    // Explicit 0-10 influence score from the curated dataset takes precedence
    const baseExtent = primaryEvent.influence !== undefined 
      ? primaryEvent.influence / 10 
      : (STATUS_EXTENT[primaryEvent.status] || 0.5);
      
    // Clamp slightly so 0 influence doesn't completely erase the region if they are explicitly mapped
    const extent = Math.max(0.05, baseExtent);
    const isWeak = extent < 0.3;
    
    // Material Upgrade: Layered feel with extent-driven opacity
    // Weight Adjustment: On mobile at low zoom, keep borders very thin to prevent crowding
    const baseWeight = isMobile ? (currentZoom <= 5 ? 0.8 : 1.25) : 2.0;
    const finalWeight = isWeak ? Math.min(1, baseWeight * 0.5) : (extent * baseWeight);
    
    return { 
      fillColor: color, 
      color: color, 
      weight: finalWeight, 
      fillOpacity: 0.08 + (extent * 0.52), 
      opacity: extent * 0.9, 
      className: `region-polygon transition-all duration-1000 ${isWeak ? 'breathing-border' : ''}`
    };
  }, [currentEra.id, activeEvents, rulers, dynasties, lang, realmsByRegion, lens, isMobile, currentZoom]);

  const onEachRegion = React.useCallback((feature: any, layer: any) => {
    const regionId = feature.properties.id;
    const regionData = regions.find(r => r.id === regionId);

    // Titles are now rendered separately in the markers-pane for precise centroid control.

    layer.on({
      click: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        onRegionClick(regionId);
        pushToDataLayer('map_region_click', { region_id: regionId, region_name: regionData?.displayName.en.full || regionId, current_year: year });
      },
      mouseover: (e: L.LeafletMouseEvent) => { 
        // Use a slight increase in opacity to provide feedback without losing the procedural colors
        const currentStyle = styleRegion(feature);
        e.target.setStyle({ 
          fillOpacity: Math.min((currentStyle.fillOpacity || 0) * 1.5, 0.45) 
        }); 
      },
      mouseout: (e: L.LeafletMouseEvent) => { 
        // Revert to the specific style logic for the Primary Fill layer (weight: 0)
        const baseStyle = styleRegion(feature);
        e.target.setStyle({ ...baseStyle, weight: 0 }); 
      }
    });
  }, [onRegionClick, year, lang, styleRegion, currentZoom]);

  return (
    <div className="w-full h-full relative bg-[#0a1410] overflow-hidden z-0">
      <svg width="0" height="0" className="absolute pointer-events-none">
        <filter id="sketch-1" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" result="noise" seed="1" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="sketch-2" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" seed="5" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="sketch-3" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" seed="9" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="map-vignette pointer-events-none z-[401]" />
      <MapFilters />
       <MapContainer 
         center={CENTER_LAT_LNG} 
         zoom={DEFAULT_ZOOM} 
         minZoom={MIN_ZOOM} 
         maxZoom={MAX_ZOOM} 
         maxBounds={MAP_BOUNDS}
         maxBoundsViscosity={0.8}
         className="w-full h-full z-0" 
         zoomControl={false} 
         attributionControl={true}
       >
         <TileLayer 
           url={`https://tile.thunderforest.com/pioneer/{z}/{x}/{y}{r}.png?apikey=${import.meta.env.VITE_THUNDERFOREST_API_KEY || ''}`}
           attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
         />
        
        {/* Cinematic Overlays - Sit exactly between the Base Map Tiles (zIndex: 200) and the Interactive Overlays (zIndex: 400+) */}
        <Pane name="cinematic-overlays" style={{ zIndex: 250 }}>
          <div 
            className="map-tint-overlay pointer-events-none" 
            style={{ opacity: Math.max(0.15, 0.75 - (currentZoom - MIN_ZOOM) * 0.15) }} 
          />
        </Pane>

        <MapEventsHandler onRegionClick={(id) => onRegionClick(id as any)} onZoomChange={setCurrentZoom} />
        
        {/* Mobile Legend Toggle (hidden in fragmentation mode: the counter list is the legend) */}
        {!fragOn && <div 
          className="sm:hidden absolute left-4 z-[1000] pointer-events-auto"
          style={{ top: 'calc(var(--safe-top, 0px) + 72px)' }}
        >
          <button 
            onClick={() => setShowLegend(!showLegend)}
            className="liquid-glass px-3 py-2 rounded-xl text-[10px] font-bold text-white flex items-center gap-2 border border-white/10 active:scale-95 transition-all shadow-lg"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {lang === 'en' ? 'MAP LEGEND' : 'راهنمای نقشه'}
          </button>
        </div>}

        {/* Legend Overlay */}
        <AnimatePresence>
          {!fragOn && showLegend && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="sm:hidden absolute left-4 liquid-glass-heavy p-3 rounded-2xl text-[9px] font-vazirmatn flex flex-col gap-1.5 text-slate-300 pointer-events-auto z-[1001] shadow-2xl overflow-visible"
              style={{ top: 'calc(var(--safe-top, 0px) + 112px)', width: '180px' }}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="font-bold text-white uppercase tracking-wider text-[8px] opacity-80">{lang === 'en' ? 'Map Legend' : 'راهنمای نقشه'}</div>
                <button onClick={() => setShowLegend(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              </div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#a855f7] shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div> {lang === 'en' ? 'Persian/Iranian' : 'ایرانی/پارسی'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> {lang === 'en' ? 'Arab/Caliphate' : 'عرب/خلافت'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#ea580c] shadow-[0_0_8px_rgba(234,88,12,0.8)]"></div> {lang === 'en' ? 'Turkic/Mongol' : 'ترک/مغول'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div> {lang === 'en' ? 'Hellenic/Greek' : 'یونانی/هلنیستی'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#b45309] shadow-[0_0_8px_rgba(180,83,9,0.8)]"></div> {lang === 'en' ? 'Nomadic/Steppe' : 'عشایر/استپ'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#e11d48] shadow-[0_0_8px_rgba(225,29,72,0.8)]"></div> {lang === 'en' ? 'Foreign Imperial' : 'امپراتوری خارجی'}</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#78350f] shadow-[0_0_8px_rgba(120,53,15,0.8)]"></div> {lang === 'en' ? 'Babylonian/Semitic' : 'بابلی/سامی'}</div>
              <div className="w-full h-px bg-white/5 my-0.5"></div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-2 rounded-sm border border-white/10 bg-indigo-500/80"></div>
                {lang === 'en' ? 'Direct Control' : 'کنترل مستقیم'}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-2 rounded-sm border border-white/10 bg-indigo-500/30"></div>
                {lang === 'en' ? 'Influence/Vassal' : 'نفوذ/دست‌نشانده'}
              </div>
              <div className="w-full h-px bg-white/5 my-0.5"></div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-[1px] border-t border-dashed border-[#f59e0b] opacity-60"></div>
                {lang === 'en' ? 'Achaemenid Max Extent' : 'حداکثر قلمرو هخامنشی'}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-[1px] border-t border-dashed border-[#818cf8] opacity-60"></div>
                {lang === 'en' ? 'Sassanid Max Extent' : 'حداکثر قلمرو ساسانی'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Static Background Neighbours (Hidden below zoom 4) */}
        {currentZoom <= 4 && neighboursGeoJSON && (
          <GeoJSON 
            data={neighboursGeoJSON as GeoJsonObject} 
            interactive={false}
            style={{ 
              fillColor: '#000000', 
              fillOpacity: 0.15, 
              color: 'rgba(255, 255, 255, 0.05)', 
              weight: 1.5, 
              dashArray: '10, 15', 
              lineCap: 'butt', 
              lineJoin: 'miter', 
              className: 'pointer-events-none'
            }} 
          />
        )}

        {/* ── Area Fills & Effects (Consolidated for Performance) ───────────────
            We render 5 global layers instead of 1,400+ individual components.
            This drastically reduces INP by lowering the Leaflet/React overhead.
        ─────────────────────────────────────────────────────────────────────── */}
        
        {/* 1. Primary Area Fills & Interaction Layer */}
        <GeoJSON
          key="regions-primary-layer"
          data={regionsGeoJSON as GeoJsonObject}
          style={(feature) => ({ ...styleRegion(feature), weight: 0 })}
          onEachFeature={onEachRegion}
        />

        {/* 2. Secondary Control Layers (Contested Regions) */}
        <GeoJSON
          key="regions-secondary-layer"
          data={regionsGeoJSON as GeoJsonObject}
          interactive={false}
          style={(feature) => {
            const regionId = feature?.properties?.id;
            if (realmsByRegion) {
              const second = realmsByRegion.get(regionId)?.[1];
              const sc = second && getDynasty(second.dynastyId)?.color;
              if (!sc || lens) return { fillOpacity: 0, weight: 0, stroke: false };
              return { fillColor: sc, fillOpacity: 0.07 + RELATION_EXTENT[second.relation] * 0.2, weight: 0, className: 'pointer-events-none mix-blend-screen' };
            }
            const events = getRegionEvents(regionId);
            if (events.length <= 1) return { fillOpacity: 0, weight: 0, stroke: false };
            
            const event = events[1];
            const ruler = rulers[event.rulerId];
            if (!ruler) return { fillOpacity: 0, weight: 0, stroke: false };
            
            const dynasty = dynasties[ruler.dynastyId];
            const color = dynasty ? getDynastyColor(dynasty) : '#ffffff';
            const opacity = event.influence !== undefined ? (event.influence / 10) * 0.4 : 0.12;
            
            return {
              fillColor: color,
              fillOpacity: opacity,
              weight: 0,
              className: 'pointer-events-none mix-blend-screen'
            };
          }}
        />

        {/* 3. Cinematic Halos (Triple-pass for soft atmospheric glow) */}
        <GeoJSON
          key="regions-halo-outer"
          data={regionsGeoJSON as GeoJsonObject}
          interactive={false}
          style={(feat) => ({ fillOpacity: 0, weight: 11, color: styleRegion(feat).color, opacity: 0.15, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })}
        />
        <GeoJSON
          key="regions-halo-mid"
          data={regionsGeoJSON as GeoJsonObject}
          interactive={false}
          style={(feat) => ({ fillOpacity: 0, weight: 6, color: styleRegion(feat).color, opacity: 0.35, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })}
        />
        <GeoJSON
          key="regions-halo-inner"
          data={regionsGeoJSON as GeoJsonObject}
          interactive={false}
          style={(feat) => ({ fillOpacity: 0, weight: 3, color: styleRegion(feat).color, opacity: 0.65, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })}
        />

        {/* 5. The Sketched Ink Border */}
        <GeoJSON 
          key="regions-ink-1"
          data={regionsGeoJSON as GeoJsonObject} 
          style={() => ({ fillOpacity: 0, weight: 2.0, color: '#8a252f', opacity: 0.8, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-1 pointer-events-none' })} 
          interactive={false} 
        />
        <GeoJSON 
          key="regions-ink-2"
          data={regionsGeoJSON as GeoJsonObject} 
          style={() => ({ fillOpacity: 0, weight: 1.2, color: '#6e1d25', opacity: 0.6, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-2 pointer-events-none' })} 
          interactive={false} 
        />
        <GeoJSON 
          key="regions-ink-3"
          data={regionsGeoJSON as GeoJsonObject} 
          style={() => ({ fillOpacity: 0, weight: 1.0, color: '#a62d39', opacity: 0.7, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-3 pointer-events-none' })} 
          interactive={false} 
        />

        {/* 6. Ghost Overlays: Max Historical Extents */}
        <GeoJSON 
          key="achaemenid-ghost"
          data={achaemenidMaxGeoJSON as GeoJsonObject} 
          style={() => ({ fillOpacity: 0.02, fillColor: '#f59e0b', weight: 1.8, color: '#f59e0b', opacity: 0.35, dashArray: '6, 8', lineJoin: 'round', className: 'pointer-events-none' })} 
          interactive={false} 
        />
        <GeoJSON 
          key="sasanian-ghost"
          data={sasanianMaxGeoJSON as GeoJsonObject} 
          style={() => ({ fillOpacity: 0.02, fillColor: '#818cf8', weight: 1.8, color: '#818cf8', opacity: 0.35, dashArray: '4, 6', lineJoin: 'round', className: 'pointer-events-none' })} 
          interactive={false} 
        />

        {/* 7. Modern Iran (2026) */}
        <Pane name="iran-modern-pane" style={{ zIndex: 450 }}>
          <GeoJSON 
            key="iran-modern"
            data={iranModernGeoJSON as GeoJsonObject} 
            style={() => ({ fillOpacity: 0, weight: 2.0, color: '#10b981', opacity: 0.55, lineJoin: 'round', lineCap: 'round', dashArray: '5, 8', className: 'pointer-events-none' })} 
            interactive={false} 
          />
        </Pane>

        {/* 8. Marker Layers: Labels, Cities, Events, Artifacts (Highest Index) */}
        <Pane name="markers-pane" style={{ zIndex: 600 }}>
          {/* Static Contiguous Neighbour Labels (using pre-calculated centroids) */}
          {currentZoom <= 7 && neighborMarkers.map((marker) => {
            const title = lang === 'fa' && marker.nameFa ? marker.nameFa : marker.name;
            const fontClass = lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel';
            const icon = L.divIcon({
              className: 'neighbour-label-container',
              html: `<div class="neighbour-label ${fontClass}">${title}</div>`,
              iconSize: [200, 30],
              iconAnchor: [100, 15]
            });
            return <Marker key={`neighbour-label-${marker.id}`} position={marker.position} icon={icon} interactive={false} />;
          })}

          {/* Core Region Titles at Hand-Picked Centroids */}
          {regions.filter(r => activeRegionIds.has(r.id)).map((r) => {
            const fontClass = lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel';
            const nameObj = lang === 'en' ? r.displayName.en : r.displayName.fa;
            const labelText = isMobile ? nameObj.short : nameObj.full;
            const icon = L.divIcon({
              className: 'region-label-container',
              html: `<div class="region-label ${fontClass} zoom-${Math.floor(currentZoom)}"><span class="tooltip-text">${labelText}</span></div>`,
              iconSize: [250, 40],
              iconAnchor: [125, 20]
            });
            return (
              <Marker 
                key={`core-label-${r.id}`} 
                position={[r.centroid.lat, r.centroid.lng] as [number, number]} 
                icon={icon} 
                interactive={false} 
              />
            );
          })}

          {/* Concurrent realms: one chip per dynasty in regions ruled by several at once */}
          {realmsByRegion && regions.filter(r => activeRegionIds.has(r.id)).map(r => {
            const list = realmsByRegion.get(r.id) ?? [];
            if (list.length < 2) return null;
            const MAX = isMobile ? 3 : 4;
            const showNames = currentZoom >= 6 || !isMobile;
            const esc = (t: string) => t.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
            const chips = list.slice(0, MAX).map(rl => {
              const d = getDynasty(rl.dynastyId)!;
              return `<span class="realm-chip ${showNames ? '' : 'dots-only'} ${lens === d.id ? 'active' : ''}" data-dyn="${d.id}"><i style="background:${d.color}"></i>${showNames ? esc(d.name[lang]) : ''}</span>`;
            }).join('');
            const more = list.length > MAX ? `<span class="realm-chip more">+${lang === 'fa' ? (list.length - MAX).toLocaleString('fa-IR') : list.length - MAX}</span>` : '';
            const icon = L.divIcon({
              className: 'realm-chips-container',
              html: `<div class="realm-chips" data-testid="realm-chips-${r.id}">${chips}${more}</div>`,
              iconSize: [130, 20 * Math.min(list.length, MAX + 1)],
              iconAnchor: [65, -8],
            });
            return (
              <Marker
                key={`chips-${r.id}-${lang}-${list.map(x => x.dynastyId).join(',')}-${lens ?? ''}-${showNames}`}
                position={[r.centroid.lat, r.centroid.lng] as [number, number]}
                icon={icon}
                bubblingMouseEvents={false}
                keyboard={false}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    const id = ((e.originalEvent.target as HTMLElement).closest('[data-dyn]') as HTMLElement | null)?.dataset.dyn;
                    if (id) toggleLens(id); else onRegionClick(r.id);
                  },
                }}
              />
            );
          })}

          {allCities.map((city, index) => {
            const showAtZoom = city.tier === 1 ? ZOOM_CITY_TIER1 : city.tier === 2 ? ZOOM_CITY_TIER2 : ZOOM_CITY_TIER3;
            if (currentZoom < showAtZoom) return null;

            const fontSizeEn = currentZoom >= (showAtZoom + 1) ? 16 : 14;
            const fontSizeFa = currentZoom >= (showAtZoom + 1) ? 16 : 14;

            return (
              <CircleMarker
                key={city.name.en + index}
                center={city.latLng}
                radius={currentZoom >= 7 ? 4 : 3}
                pathOptions={{
                  color: '#0a1410',
                  weight: 1,
                  fillColor: 'rgba(201,169,110,0.6)',
                  fillOpacity: 1
                }}
                interactive={false}
              >
                <Tooltip
                  direction="right"
                  offset={[6, 0]}
                  permanent={true}
                  className="city-tooltip bg-transparent border-0 shadow-none"
                >
                  <span style={{
                    fontFamily: lang === 'fa' ? "'Vazirmatn', sans-serif" : "'Crimson Pro', serif",
                    fontSize: lang === 'fa' ? `${fontSizeFa}px` : `${fontSizeEn}px`,
                    color: 'rgba(255, 255, 255, 0.85)',
                    textShadow: isMobile 
                      ? '0 0 6px #000, 0 1px 2px #000, 0 0 16px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)'
                      : '0 0 8px rgba(0,0,0,0.9), 0 1px 3px #000, 0 0 20px rgba(0,0,0,0.6)',
                    pointerEvents: 'none' as const,
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {city.name[lang]}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}

          {activeHistoricalEvents.map(event => (
            <CircleMarker 
              key={event.id} 
              center={event.latLng} 
              radius={8} 
              className="event-marker" 
              pathOptions={{ 
                fillColor: event.type === 'battle' ? '#f43f5e' : event.type === 'downfall' ? '#c084fc' : event.type === 'political' ? '#38bdf8' : '#34d399', 
                color: '#fff', 
                weight: 1, 
                fillOpacity: 0.8, 
                className: 'event-marker' 
              }} 
              eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onHistoricalEventClick?.(event); } }}
            >
              <Tooltip 
                direction="top" 
                offset={[0, -4]} 
                className={`event-label ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel'}`}
              >
                <span className="event-icon" style={{ color: event.type === 'battle' ? '#f43f5e' : event.type === 'downfall' ? '#c084fc' : event.type === 'political' ? '#38bdf8' : '#34d399' }}>◆</span>
                <span className="tooltip-text">{event.title[lang]}</span>
              </Tooltip>
            </CircleMarker>
          ))}

          {activeArtifacts.map(artifact => (
            <CircleMarker key={artifact.id} center={artifact.latLng} radius={8} className="event-marker" pathOptions={{ fillColor: '#fbbf24', color: '#fff', weight: 1, fillOpacity: 0.8, className: 'event-marker' }} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onArtifactClick?.(artifact); } }}>
              <Tooltip 
                direction="top" 
                offset={[0, -4]} 
                className={`event-label ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel'}`}
              >
                <span className="event-icon" style={{ color: '#fbbf24' }}>◆</span>
                <span className="tooltip-text">{artifact.name[lang]}</span>
              </Tooltip>
            </CircleMarker>
          ))}

          {activeRulerCapitals.map(cap => (
             <CircleMarker 
              key={`cap-${cap!!.id}`} 
              center={cap!!.latLng} 
              radius={7} 
              pathOptions={{ 
                fillColor: cap!!.color, 
                color: '#fff', 
                weight: 1.5, 
                fillOpacity: 1,
                className: 'ruler-capital-marker animate-pulse'
              }}
              eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onRegionClick(cap!!.regionId); } }}
            >
              <Tooltip 
                direction="top" 
                offset={[0, -4]} 
                className={`event-label ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel'}`}
                permanent={currentZoom >= 6}
              >
                <div className="flex items-center gap-1.5 px-0.5">
                  <Crown className="w-3 h-3" style={{ color: cap!!.color }} />
                  <span className="tooltip-text">{cap!!.name[lang]}</span>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

          {activeVazirs.map(v => (

            <CircleMarker key={v.id} center={v.latLng} radius={6} pathOptions={{ fillColor: '#c9a96e', color: '#0a1410', weight: 1, fillOpacity: 1 }} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onVazirClick?.(v as any); } }}>
              <Tooltip 
                direction="top" 
                offset={[0, -4]} 
                className={`event-label ${lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel'}`}
              >
                <span className="event-icon" style={{ color: '#c9a96e' }}>◆</span>
                <span className="tooltip-text">{v.name[lang]}</span>
              </Tooltip>
            </CircleMarker>
          ))}
        </Pane>

        <ZoomControls />
      </MapContainer>
      {fragOn && <FragmentationHud year={year} lang={lang} />}
    </div>
  );
}
