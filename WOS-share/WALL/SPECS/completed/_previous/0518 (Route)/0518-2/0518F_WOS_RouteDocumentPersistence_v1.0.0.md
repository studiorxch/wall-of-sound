---
Goal:

- save/load route paths
- waypoint editing
- route metadata
- route collections
---



# Discovery

---
# Spec

---
# Refinement 

---
# Development

```
interface MediaSurface {
  id: string;                // UUID v4 format
  name: string;              // Human-readable display name
  type: string;              // e.g., "billboard", "digital_screen", "projection"
  runtime: 'static' | 'dynamic' | 'interactive'; 
  
  // Strict structure for geographic and spatial data
  metadata: {
    geography?: {
      coordinates: {
        latitude: number;    // WGS84 format (-90 to 90)
        longitude: number;   // WGS84 format (-180 to 180)
        altitude?: number;   // Optional meters above sea level
      };
      address?: {
        street?: string;
        city?: string;
        country?: string;
        postalCode?: string;
      };
      timezone?: string;     // IANA format (e.g., "America/New_York")
    };
    [key: string]: any;      // Allows for other extensibility
  };

  layers: MediaLayer[];      // Array of visual/content configurations
  runtimeState: Record<string, any>; // Current active state of the surface
  createdAt: string;         // ISO 8601 UTC timestamp
  updatedAt: string;         // ISO 8601 UTC timestamp
}

interface MediaLayer {
  id: string;
  zIndex: number;
  type: 'video' | 'image' | 'html' | 'vector';
  config: Record<string, any>;
}

```