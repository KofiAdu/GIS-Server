
## Architecture Overview

This project uses **GeoServer** as the core GIS engine, with a custom **Node.js API layer** to provide secure, simplified access to spatial data. A React + Mapbox frontend interacts with this stack for rich GIS visualizations and user interactions.

### 🔹 Components

#### 1. **Frontend (React + Mapbox GL JS)**
- Loads vector/raster tiles from `/tiles/:layer/:z/:x/:y.mvt`
- Fetches filtered GeoJSON via `/features/:layer?...`
- Allows users to draw or upload features
- Optional: Layer toggle, stats, mobile support

#### 2. **Custom Node.js API Layer**
- Acts as a gateway to GeoServer
- Handles authentication (JWT)
- Simplifies WMS/WFS endpoints
- Enables feature upload/edit/delete
- Adds filtering, metrics, and preprocessing

#### 3. **GeoServer**
- Serves vector and raster tiles (WMS, WMTS, MVT)
- Exposes geospatial data via WFS
- Performs spatial queries using PostGIS
- Styles layers using SLD

#### 4. **PostGIS (PostgreSQL + GIS extension)**
- Stores spatial data (points, polygons, lines)
- Supports fast spatial indexing and querying
- Acts as the source for GeoServer layers

---
 
### Tech Stack

| Layer      | Tech                          |
|------------|-------------------------------|
| Frontend   | React, Mapbox GL JS           |
| Backend    | Node.js (Express)  |
| GIS Engine | GeoServer                     |
| Database   | PostgreSQL + PostGIS          |
| DevOps     | Docker       |


## Data Flow

[Frontend – Mapbox GL + React]  
    ↓  
[Node.js API Layer]  
 ↳ Auth  
 ↳ Uploads / Edits  
 ↳ Feature queries / stats  
    ↓  
[GeoServer]  
 ↳ Serves tiles & GeoJSON (WMS/WFS)  
 ↳ Connected to PostGIS  
    ↓  
[PostGIS DB]
