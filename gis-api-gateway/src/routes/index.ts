import { Router, Request, Response } from 'express'
import axios from 'axios'
import qs from 'querystring'
import http from 'http'
import https from 'https'

const router = Router()

//defaults for axios
//
const upstream = axios.create({
  timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 15000),
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
  validateStatus: () => true, // we'll handle status ourselves
  auth: {
    username: process.env.GEOSERVER_USER || '',
    password: process.env.GEOSERVER_PASSWORD || '',
  },
  headers: { 'User-Agent': 'crowdsorsa-demo-api/1.0' },
})

/*
workspace: created in geoserver 
gridset: to determine GeoWebCache(GWC) tile url this gateway to proxy to, default is the tms label for the web mercator in GWC
geom: geomtry column used for the bounding box
max_z: the maximum zoom range for tiles
*/
const WORKSPACE = process.env.WORKSPACE || 'demo'
const GRIDSET = process.env.TILE_GRIDSET || 'EPSG:900913'
const GEOM_COL = process.env.GEOM_COLUMN || 'geom'
const MAX_Z = Number(process.env.MAX_Z || 24)

//helpers 
const isInt = (v: string) => /^[0-9]+$/.test(v);
const isLayerName = (v: string) => /^[A-Za-z0-9_]+$/.test(v); //imit layer "local name" to alnum + underscore(current layer in geoserver: global_mining_polygons)

//validation tile coordinates to guard z/x/y bound when a user zooms
function validateTileCoords(zs: string, xs: string, ys: string) {
  if (!isInt(zs) || !isInt(xs) || !isInt(ys)) return 'z/x/y must be integers';
  const z = Number(zs), x = Number(xs), y = Number(ys)
  if (z < 0 || z > MAX_Z) return `z must be between 0 and ${MAX_Z}`;
  const max = (1 << z) - 1
  if (x < 0 || x > max || y < 0 || y > max) return `x/y must be in [0, ${max}] for z=${z}`;
  return null
}

//parse and validate bbox in EPSG:4326 bounds.
function parseBbox(bboxStr: string) {
  const parts = bboxStr.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return { error: 'bbox must be "minX,minY,maxX,maxY"' }
  const [minX, minY, maxX, maxY] = parts
  if (minX >= maxX || minY >= maxY) return { error: 'bbox min must be less than max' };
  if (minX < -180 || maxX > 180 || minY < -90 || maxY > 90) return { error: 'bbox must be in EPSG:4326 range' };
  return { minX, minY, maxX, maxY }
}

//value escape for CQL single-quoted literals
const cqlEscape = (v: string) => v.replace(/'/g, "''");

//attribute whitelist (optional)
const ATTR_WHITELIST = (process.env.ATTR_WHITELIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean) // e.g. "country,type,status"

//get features of a layer
router.get('/features', async (req: Request, res: Response) => {
  const { bbox, layer, workspace, limit = '1000', ...rest } = req.query

   //just for local testing
  if (!layer || typeof layer !== 'string' || !isLayerName(layer)) {
    return res.status(400).json({ error: 'Missing or invalid layer name' })
  }
  
  //checking boundbox
  if (!bbox || typeof bbox !== 'string') {
    return res.status(400).json({ error: 'Missing bbox' })
  }
  const bboxParsed = parseBbox(bbox)
  if ('error' in bboxParsed) return res.status(400).json({ error: bboxParsed.error })

    //limit for heavy queries
  const lim = Number(limit)
  if (!Number.isInteger(lim) || lim < 1 || lim > 10000) {
    return res.status(400).json({ error: 'limit must be integer 1..10000' })
  }

  //safe CQL: bbox with optional equality filters
  const cql: string[] = [
    `BBOX(${GEOM_COL}, ${bboxParsed.minX}, ${bboxParsed.minY}, ${bboxParsed.maxX}, ${bboxParsed.maxY}, 'EPSG:4326')`,
  ]

  for (const [key, val] of Object.entries(rest)) {
    if (typeof val !== 'string') continue
    if (ATTR_WHITELIST.length && !ATTR_WHITELIST.includes(key)) continue
    if (!/^[A-Za-z0-9_]+$/.test(key)) continue
    cql.push(`${key}='${cqlEscape(val)}'`)
  }

  //overwrite workspace or use default in env
  const tWorkspace = (typeof workspace === 'string' && workspace) ? workspace : WORKSPACE;

  //build wfs get feature query. for geojson response
  const params = {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: `${tWorkspace}:${layer}`,
    outputFormat: 'application/json',
    count: lim,
    cql_filter: cql.join(' AND '),
  };
  const url = `${process.env.GEOSERVER_URL}/wfs?${qs.stringify(params)}`

  try {
    const r = await upstream.get(url)
    if (r.status !== 200) return res.status(r.status).send(r.data)
    //small cache window
    res.setHeader('Cache-Control', 'public, max-age=15')
    return res.json(r.data)
  } catch (e: any) {
    console.error('[features] upstream error', e.message)
    return res.status(502).json({ error: 'Upstream WFS failed' })
  }
})

//get cached tiles 
router.get('/tiles/:layer/:z/:x/:y.pbf', async (req: Request, res: Response) => {
  const { layer, z, x, y } = req.params

 //check weird layer names
  if (!isLayerName(layer)) return res.status(400).send('Invalid layer name')
  const coordErr = validateTileCoords(z, x, y)
  if (coordErr) return res.status(400).send(coordErr)

    //build gwc tms url for pbf tiles
  const tileUrl =
    `${process.env.GEOSERVER_URL}/gwc/service/tms/1.0.0/` +
    `${WORKSPACE}:${layer}@${GRIDSET}@pbf/${z}/${x}/${y}.pbf`

  //abort if streaming stalls, like if the GeoServer hangs mid-transfer
  res.setTimeout(Number(process.env.STREAM_TIMEOUT_MS || 20000), () => {
    console.warn('[tiles] response stream timeout', tileUrl);
    res.destroy(new Error('Tile stream timeout'))
  });

  try {
    //request tile as a stream
    const r = await upstream.get(tileUrl, { responseType: 'stream', headers: { Accept: 'application/x-protobuf' } })
    if (r.status !== 200) {
      res.status(r.status)
      res.setHeader('Content-Type', r.headers['content-type'] || 'text/plain')
      return r.data.pipe(res)
    }
    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type'] as string)
    if (r.headers['content-encoding']) res.setHeader('Content-Encoding', r.headers['content-encoding'] as string)
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return r.data.pipe(res)
  } catch (e: any) {
    console.error('[tiles] exception', e.message)
    return res.status(502).send('Upstream tile fetch failed')
  }
})


//get all layers in loaded in the geosever
router.get('/layers', async (_req: Request, res: Response) => {
  const url = `${process.env.GEOSERVER_URL}/rest/layers.json`
  try {
    const r = await upstream.get(url)
    return res.status(r.status).send(r.data)
  } catch (e: any) {
    console.error('[layers] upstream error', e.message);
    return res.status(502).json({ error: 'Upstream REST failed' })
  }
})

//health
router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))

export default router
