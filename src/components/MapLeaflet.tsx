import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Marker, Pane, useMap, useMapEvents } from 'react-leaflet';
import { GeoJsonObject } from 'geojson';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import regionsGeoJSON from '../data/regions.json';
import neighboursGeoJSON from '../data/neighbours.json';
import iranModernGeoJSON from '../data/iran_modern.json';
import { regions, RegionId } from '../data/regions';
import { ReignEvent } from '../data/events';
import { Ruler } from '../data/rulers';
import { Dynasty } from '../data/dynasties';
import { HistoricalEvent } from '../data/historicalEvents';
import { Artifact } from '../data/artifacts';
import { Vazir } from '../data/vazirs';
import { pushToDataLayer } from '../services/tagManager';
import { MapFilters } from './MapFilters';
import { Sparkles, Swords, Skull, Landmark, Globe2, Building2, Book, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { mapPolygons, ZOOM_ANCHOR_CITIES, ZOOM_ALL_CITIES } from '../data/mapPolygons';

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
const MAX_ZOOM = 10;

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

  const allCities = useMemo(() => {
    return regions.flatMap(r => (r.anchorCities || []).map((c, i) => ({
      id: c.name.toLowerCase().replace(/\\s+/g, '_'),
      name: { en: c.name, fa: c.nameFa },
      regionId: r.id,
      latLng: [c.lat, c.lng] as [number, number],
      tier: i === 0 ? 1 : i === 1 ? 2 : 3
    })));
  }, []);

  const styleRegion = (feature: any) => {
    const regionId = feature.properties.id;
    const regionEvents = activeEvents.filter(e => e.regionId === regionId);
    if (!regionEvents || regionEvents.length === 0) return { fillColor: 'transparent', color: 'rgba(255, 255, 255, 0.04)', weight: 0.5, fillOpacity: 0, opacity: 0.2, className: 'calm-transition' };
    const primaryEvent = regionEvents.find(e => e.status === 'Direct Control') || regionEvents[0];
    const ruler = rulers[primaryEvent.rulerId];
    if (!ruler) return { fillColor: 'transparent', color: 'transparent', weight: 0, fillOpacity: 0 };
    const dynasty = dynasties[ruler.dynastyId];
    const color = dynasty ? getDynastyColor(dynasty) : '#ffffff';
    const isSphere = primaryEvent.status === 'Sphere of Influence' || primaryEvent.status === 'Contested/Warzone';
    
    // Material Upgrade: Layered feel
    return { 
      fillColor: color, 
      color: color, 
      weight: isSphere ? 1 : 2.5, 
      fillOpacity: isSphere ? 0.05 : 0.15, 
      opacity: isSphere ? 0.4 : 0.85, 
      className: 'region-polygon transition-all duration-1000'
    };
  };

  const onEachRegion = (feature: any, layer: any) => {
    layer.on({
      click: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const regionId = feature.properties.id;
        onRegionClick(regionId);
        const regionData = regions.find(r => r.id === regionId);
        pushToDataLayer('map_region_click', { region_id: regionId, region_name: regionData?.displayName.en || regionId, current_year: year });
      },
      mouseover: (e: L.LeafletMouseEvent) => { e.target.setStyle({ fillOpacity: 0.4, weight: 3 }); },
      mouseout: (e: L.LeafletMouseEvent) => { e.target.setStyle(styleRegion(feature)); }
    });
  };

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
      <MapContainer center={CENTER_LAT_LNG} zoom={DEFAULT_ZOOM} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} className="w-full h-full z-0" zoomControl={false} attributionControl={true}>
        <TileLayer 
          url={`https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.png${import.meta.env.VITE_STADIA_API_KEY ? `?api_key=${import.meta.env.VITE_STADIA_API_KEY}` : ''}`}
          attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors' 
        />
        
        {/* Cinematic Overlays - Sit exactly between the Base Map Tiles (zIndex: 200) and the Interactive Overlays (zIndex: 400+) */}
        <Pane name="cinematic-overlays" style={{ zIndex: 250 }}>
          <div className="map-tint-overlay pointer-events-none" />
        </Pane>

        <MapEventsHandler onRegionClick={(id) => onRegionClick(id as any)} onZoomChange={setCurrentZoom} />
        
        {/* Static Background Neighbours */}
        <GeoJSON 
          key={`neighbours-${year}`} 
          data={neighboursGeoJSON as GeoJsonObject} 
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
          interactive={false} 
        />

        {/* Layered Cartographic Stack: Rotring Technical Pen Style */}
        
        {/* 1. Base Region Area Fill */}
        <GeoJSON 
          key={`regions-fill-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ ...styleRegion(feat), lineJoin: 'miter', lineCap: 'butt', weight: 0 })} 
          onEachFeature={onEachRegion} 
        />

        {/* 2. Technical Halo Layer 1 (Wide, Transparent) */}
        <GeoJSON 
          key={`regions-halo1-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 11, color: styleRegion(feat).color, opacity: 0.15, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })} 
          interactive={false} 
        />

        {/* 3. Technical Halo Layer 2 (Medium) */}
        <GeoJSON 
          key={`regions-halo2-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 6, color: styleRegion(feat).color, opacity: 0.35, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })} 
          interactive={false} 
        />

        {/* 4. Technical Halo Layer 3 (Sharp Core) */}
        <GeoJSON 
          key={`regions-halo3-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 3, color: styleRegion(feat).color, opacity: 0.65, lineJoin: 'miter', lineCap: 'butt', className: 'pointer-events-none' })} 
          interactive={false} 
        />

        {/* 5. The Sketched Ink Border (3 Overlapping Displaced Solid Paths) */}
        <GeoJSON 
          key={`regions-drawn-1-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 2.0, color: '#8a252f', opacity: 0.8, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-1 pointer-events-none' })} 
          interactive={false} 
        />
        <GeoJSON 
          key={`regions-drawn-2-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 1.2, color: '#6e1d25', opacity: 0.6, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-2 pointer-events-none' })} 
          interactive={false} 
        />
        <GeoJSON 
          key={`regions-drawn-3-${year}`} 
          data={regionsGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 1.0, color: '#a62d39', opacity: 0.7, lineJoin: 'miter', lineCap: 'butt', className: 'sketch-path-3 pointer-events-none' })} 
          interactive={false} 
        />

        {/* 6. Modern Iran (2026) Ghost Overlay */}
        <GeoJSON 
          key={`iran-modern-${year}`} 
          data={iranModernGeoJSON as GeoJsonObject} 
          style={(feat) => ({ fillOpacity: 0, weight: 1.5, color: '#10b981', opacity: 0.4, lineJoin: 'miter', lineCap: 'butt', dashArray: '5, 10', className: 'sketch-path-2 pointer-events-none' })} 
          interactive={false} 
        />

        {/* Static Contiguous Neighbour Labels */}
        {(neighboursGeoJSON as any).features.map((feat: any) => {
          if (currentZoom > 7) return null; // Hide background labels when zooming in tight
          const centroid = turf.centerOfMass(feat).geometry.coordinates;
          const title = lang === 'fa' && feat.properties.nameFa ? feat.properties.nameFa : feat.properties.name;
          const fontClass = lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel';
          const icon = L.divIcon({
            className: 'neighbour-label-container',
            html: `<div class="neighbour-label ${fontClass}">${title}</div>`,
            iconSize: [200, 30],
            iconAnchor: [100, 15]
          });
          return <Marker key={`neighbour-label-${feat.properties.id}`} position={[centroid[1], centroid[0]] as [number, number]} icon={icon} interactive={false} />;
        })}

        {regions.map((poly) => {
          if (currentZoom > 7.5) return null;
          const center = poly.centroid ? [poly.centroid.lat, poly.centroid.lng] : null;
          if (!center) return null;
          const fontClass = lang === 'fa' ? 'font-vazirmatn' : 'font-cinzel';
          const icon = L.divIcon({
            className: 'custom-region-label',
            html: `<div class="region-label-cinematic ${fontClass}">${lang === 'en' ? poly.displayName.en : poly.displayName.fa}</div>`,
            iconSize: [120, 24],
            iconAnchor: [60, 12]
          });
          return <Marker key={`label-${poly.id}`} position={center as [number, number]} icon={icon} interactive={false} />;
        })}
        {allCities.map(city => {
          const dotVisible = (city.tier === 1 && currentZoom >= 4) || (city.tier === 2 && currentZoom >= 5) || (city.tier === 3 && currentZoom >= 6);
          if (!dotVisible) return null;
          
          let tierClass = 'city-label-minor';
          let labelOpacity = 0.4;
          let baseOpacity = 0.6;
          
          if (city.tier === 1) {
            tierClass = 'city-label-gold';
            labelOpacity = currentZoom >= 4.5 ? 1 : 0;
            baseOpacity = 0.9;
          } else if (city.tier === 2) {
            tierClass = 'city-label-major';
            labelOpacity = currentZoom >= 5.5 ? 0.9 : 0;
            baseOpacity = 0.7;
          } else {
            labelOpacity = currentZoom >= 6.5 ? 0.6 : 0;
            baseOpacity = 0.4;
          }

          return (
            <CircleMarker key={city.id} center={city.latLng} radius={city.tier === 1 ? 3 : 2} pathOptions={{ fillColor: city.tier === 1 ? '#FFD875' : '#d4c49a', color: '#0a1410', weight: 1, fillOpacity: baseOpacity }} interactive={false}>
              <Tooltip direction="top" permanent opacity={labelOpacity} className="city-tooltip bg-transparent border-0 shadow-none">
                <span className={`font-sans ${tierClass} ${lang === 'fa' ? 'text-[11px]' : 'text-[10px] sm:text-[11px]'}`}>
                  {city.name[lang]}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
        {activeHistoricalEvents.map(event => (
          <CircleMarker key={event.id} center={event.latLng} radius={8} className="event-marker" pathOptions={{ fillColor: event.type === 'battle' ? '#f43f5e' : event.type === 'downfall' ? '#c084fc' : event.type === 'political' ? '#38bdf8' : '#34d399', color: '#fff', weight: 1, fillOpacity: 0.8, className: 'event-marker' }} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onHistoricalEventClick?.(event); } }}>
            <Tooltip direction="top"><div className="flex items-center gap-2">{getEventIcon(event.type)}<span className="font-sans text-xs font-bold">{event.title[lang]}</span></div></Tooltip>
          </CircleMarker>
        ))}
        {activeArtifacts.map(artifact => (
          <CircleMarker key={artifact.id} center={artifact.latLng} radius={8} className="event-marker" pathOptions={{ fillColor: '#fbbf24', color: '#fff', weight: 1, fillOpacity: 0.8, className: 'event-marker' }} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onArtifactClick?.(artifact); } }}>
            <Tooltip direction="top"><div className="flex items-center gap-2">{getArtifactIcon(artifact.type)}<span className="font-sans text-xs font-bold">{artifact.name[lang]}</span></div></Tooltip>
          </CircleMarker>
        ))}
        {activeVazirs.map(v => (
          <CircleMarker key={v.id} center={v.latLng} radius={6} pathOptions={{ fillColor: '#c9a96e', color: '#0a1410', weight: 1, fillOpacity: 1 }} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onVazirClick?.(v as any); } }}>
            <Tooltip direction="right"><span className="font-cinzel text-xs font-bold gold-text">{v.name[lang]}</span></Tooltip>
          </CircleMarker>
        ))}
        <ZoomControls />
      </MapContainer>
    </div>
  );
}
