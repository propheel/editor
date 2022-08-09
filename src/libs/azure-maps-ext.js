import JSZip from 'jszip'

const apiVersion = "2022-01-01-preview";

const domains = [
  "us.atlas.microsoft.com",
  "eu.atlas.microsoft.com",
  "us.t-azmaps.azurelbs.com",
  "eu.t-azmaps.azurelbs.com"
];

const indoorLayers = new Set([
  "facility",
  "level",
  "unit",
  "vertical_penetration",
  "opening",
  "structure",
  "area_element",
  "line_element",
  "labels_indoor"]);

const fakeDomainForSprite = "https://fake.domain.com/for/sprite";

// Azure Maps REST API URLs:
function getTilesetMetadataUrl(domain, tilesetId) { return "https://" + domain + "/tilesets/" + tilesetId + "?api-version=" + apiVersion; }
function createStyleUrl(domain, alias, description) { return "https://" + domain + "/styles?api-version=" + apiVersion + "&styleFormat=azureMapsStyle&alias=" + alias + "&description=" + description; }
function listStylesUrl(domain) { return "https://" + domain + "/styles?api-version=" + apiVersion; }
function getStyleUrl(domain, styleName) { return "https://" + domain + "/styles/" + styleName + "?api-version=" + apiVersion + "&styleFormat=azureMapsStyle"; }
function deleteStyleUrl(domain, styleName) { return "https://" + domain + "/styles/" + styleName + "?api-version=" + apiVersion; }
function createMapConfigurationUrl(domain, alias, description) { return "https://" + domain + "/styles/mapConfigurations?api-version=" + apiVersion + "&alias=" + alias + "&description=" + description; }
function listMapConfigurationsUrl(domain) { return "https://" + domain + "/styles/mapConfigurations?api-version=" + apiVersion; }
function getMapConfigurationUrl(domain, mapConfigurationName) { return "https://" + domain + "/styles/mapConfigurations/" + mapConfigurationName + "?api-version=" + apiVersion; }
function deleteMapConfigurationUrl(domain, mapConfigurationName) { return "https://" + domain + "/styles/mapConfigurations/" + mapConfigurationName + "?api-version=" + apiVersion; }

// Wrapper functions to issue requests:
async function processResponse(response, canceled) {
  if (canceled) return null;
  if (!response.ok) {
    let err = new Error('Response is not OK. Check console');
    err.response = await response.json();
    console.log(err.response);
    throw err;
  }
  return response;
}

async function processJsonResponse(response, canceled) {
  let processedResponse = await processResponse(response, canceled);
  return processedResponse ? await processedResponse.json() : processedResponse;
}

async function processBlobResponse(response, canceled) {
  let processedResponse = await processResponse(response, canceled);
  return processedResponse ? await processedResponse.blob() : processedResponse;
}

async function getTilesetMetadata(domain, tilesetId, subscriptionKey, canceled) {
  return processJsonResponse( await fetch(getTilesetMetadataUrl(domain, tilesetId), {
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function uploadStyleArtifact(url, blob, subscriptionKey) {
  let response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin",
    body: blob
  });

  if (!response.ok || !response.headers.has("operation-location")) {
    console.log(response)
    throw new Error('Response is not OK. Check console');
  }

  const statusUrl = response.headers.get("operation-location");
  while (true) {
    await delay(1000);
    let statusResponse = await fetch(statusUrl, {
      mode: 'cors',
      headers: {'subscription-key': subscriptionKey},
      credentials: "same-origin"
    });
    console.log(statusResponse);
    console.log(statusResponse.headers)
    if (!statusResponse.ok) {
      console.log(await statusResponse.json());
      throw new Error('Response is not OK. Check console');
    }
    if (statusResponse.headers.has('resource-location')) {
      const resourceLocation = statusResponse.headers.get('resource-location');
      let pathArray = resourceLocation.split('?');
      pathArray = pathArray[0].split('/');
      return pathArray[pathArray.length-1]; // return GUID of the newly generated artifact
    }
    const jsonResponse = await statusResponse.json();
    if (jsonResponse.status !== "Running")
    {
      console.log(jsonResponse);
      throw new Error('Response is not OK. Check console');
    }
  }
}

async function createStyle(domain, alias, description, blob, subscriptionKey, canceled) {
  if (alias.startsWith("microsoft")) {
    throw new Error("Aliases starting with 'microsoft' are forbidden.");
  }
  return await uploadStyleArtifact(createStyleUrl(domain, alias, description), blob, subscriptionKey);
}

async function listStyles(domain, subscriptionKey, canceled) {
  return processJsonResponse( await fetch(listStylesUrl(domain), {
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function getStyle(domain, styleName, subscriptionKey, canceled) {
  return processBlobResponse( await fetch(getStyleUrl(domain, styleName), {
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function deleteStyle(domain, styleName, subscriptionKey, canceled) {
  return processResponse( await fetch(deleteStyleUrl(domain, styleName), {
    method: 'DELETE',
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function createMapConfiguration(domain, alias, description, blob, subscriptionKey, canceled) {
  if (alias.startsWith("microsoft")) {
    throw new Error("Aliases starting with 'microsoft' are forbidden.");
  }
  return await uploadStyleArtifact(createMapConfigurationUrl(domain, alias, description), blob, subscriptionKey);
}

async function listMapConfigurations(domain, subscriptionKey, canceled) {
  return processJsonResponse( await fetch(listMapConfigurationsUrl(domain), {
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function getMapConfiguration(domain, mapConfigurationName, subscriptionKey, canceled) {
  return processBlobResponse( await fetch(getMapConfigurationUrl(domain, mapConfigurationName), {
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

async function deleteMapConfiguration(domain, mapConfigurationName, subscriptionKey, canceled) {
  return processResponse( await fetch(deleteMapConfigurationUrl(domain, mapConfigurationName), {
    method: 'DELETE',
    mode: 'cors',
    headers: {'subscription-key': subscriptionKey},
    credentials: "same-origin"
  }), canceled);
}

function ensureMapConfigurationListValidity(mapConfigurationList) {
  return mapConfigurationList;
}

function ensureMapConfigurationValidity(mapConfiguration) {
  return mapConfiguration;
}

class AzureMapsStyle {

  constructor() {
    this._zip = null;
    this._json = null;
    this._jsonFileName = "";
    this._spriteSheets = {};
  }

  get layers() { return this._json?.layers; }

  async load(styleBlob) {
    this._zip = await JSZip.loadAsync(styleBlob);

    // check file structure
    let jsons = new Set();
    let pngs = new Set();
    for (const zipEntry in this._zip.files) {
      if (zipEntry.toLowerCase().endsWith(".json")) jsons.add(zipEntry.substring(0, zipEntry.length - 5));
      if (zipEntry.toLowerCase().endsWith(".png")) pngs.add(zipEntry.substring(0, zipEntry.length - 4));
    }
    if (jsons.size - pngs.size != 1) {
      console.error("The number of JSON files (" + jsons.size + ") must be greater than PNG files (" + pngs.size + ") exactly by 1");
      return;
    }
    for (const imageName of pngs) jsons.delete(imageName);
    if (jsons.size != 1) {
      console.error("There must be a single JSON file being the style. " + jsons.size + " JSON files found.");
      return;
    }

    // Load sprite sheets into memory
    for (const imageName of pngs) {
      const pixelRatio = imageName.endsWith("@2x") ? "2" : "1";
      this._spriteSheets[pixelRatio + ".json"] = URL.createObjectURL(await this._zip.file(imageName + ".json").async("blob"));
      this._spriteSheets[pixelRatio + ".png"] = URL.createObjectURL(await this._zip.file(imageName + ".png").async("blob"));
    }

    // load style
    this._jsonFileName = jsons.values().next().value + ".json";
    this._json = JSON.parse(await this._zip.file(this._jsonFileName).async("string"));
  }

  getSpriteUrl(spriteUrl) {
    switch (spriteUrl) {
      case fakeDomainForSprite + ".json":
      case fakeDomainForSprite + "@1x.json":
        return this._spriteSheets["1.json"];
      case fakeDomainForSprite + ".png":
      case fakeDomainForSprite + "@1x.png":
        return this._spriteSheets["1.png"];
      case fakeDomainForSprite + "@2x.json":
        return this._spriteSheets["2.json"];
      case fakeDomainForSprite + "@2x.png":
        return this._spriteSheets["2.png"];
    }
  }

  updateAndGenerateZip(styleJson) {
    this._json = styleJson;
    this._zip.file(this._jsonFileName, JSON.stringify(styleJson));
    return this._zip.generateAsync({type: "blob"});
  }
}

class AzureMapsMapConfiguration {

  constructor() {
    this._zip = null;
    this._json = null;
    this._jsonFileName = "";
    this._styleTuples = [];
  }

  get styleTuples() { return this._styleTuples; }

  get styles() { return this._json.styles; }

  async load(mapConfigurationBlob) {
    this._zip = await JSZip.loadAsync(mapConfigurationBlob);

    // check file structure
    let jsons = new Set();
    for (const zipEntry in this._zip.files) {
      if (zipEntry.toLowerCase().endsWith(".json")) jsons.add(zipEntry.substring(0, zipEntry.length - 5));
    }
    if (jsons.size != 1) {
      console.error("The number of JSON files (" + jsons.size + ") must be exactly 1 which is map configuration");
      return;
    }

    // load map configuration
    this._jsonFileName = jsons.values().next().value + ".json";
    this._json = ensureMapConfigurationValidity(JSON.parse(await this._zip.file(this._jsonFileName).async("string")));
    this._styleTuples = this.extractStyleTuples();
  }

  generateZip() {
    this._zip.file(this._jsonFileName, JSON.stringify(this._json));
    return this._zip.generateAsync({type: "blob"});
  }

  extractStyleTuples() {
    var styleTuples = [];
    for (const style of this._json.styles) {
      for (const tuple of style.layers) {
        styleTuples.push(tuple.styleId + " + " + tuple.tilesetId);
      }
    }
    return styleTuples;
  }

  getStyleTupleDetails(styleTupleIndex) {
    let index = 0;
    for (const style of this._json.styles) {
      for (const tuple of style.layers) {
        if (index == styleTupleIndex) {
          return {
            style: style,
            tilesetId: tuple.tilesetId,
            styleId: tuple.styleId
          };
        }
        ++index;
      }
    }
  }

  updateStyleTupleDetails(styleTupleIndex, newStyle, tilesetId, styleId) {
    let index = 0;
    for (const styleIndex in this._json.styles) {
      if (Object.hasOwn(this._json.styles, styleIndex)) {
        for (const tupleIndex in this._json.styles[styleIndex].layers) {
          if (Object.hasOwn(this._json.styles[styleIndex].layers, tupleIndex)) {
            if (index == styleTupleIndex) {
              if (!newStyle) {
                newStyle = this._json.styles[styleIndex];
              }
              if (tilesetId) {
                newStyle.layers[tupleIndex].tilesetId = tilesetId;
              }
              if (styleId) {
                newStyle.layers[tupleIndex].styleId = styleId;
              }
              this._json.styles[styleIndex] = newStyle;
              this._styleTuples = this.extractStyleTuples();
              return;
            }
            ++index;
          }
        }
      }
    }
  }
}

class AzureMapsTilesetMetadata {
  constructor(tilesetMetadataJson) {
    this._json = tilesetMetadataJson;
  }

  get json() { return this._json; }
  set json(newJson) { this._json = newJson; }

  get minZoom() { return this._json?.minZoom; }

  get maxZoom() { return this._json?.maxZoom; }

  get bbox() { return this._json?.bbox; }
}

const defaultMapConfigurationList = {
  "mapConfigurations": [
  ]
};

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

class AzureMapsExtension {

  constructor() {
    this._subscriptionKey = "";
    this._domain = domains[0];
    this._mapConfigurationList = defaultMapConfigurationList;
    this._mapConfigurationName = "";
    this._mapConfiguration = new AzureMapsMapConfiguration();
    this._styleTupleIndex = "";
    this._style = null;
    this._styleAlias = "";
    this._styleDescription = "";
    this._language = "en-us";
    this._view = "Unified";
    this._tilesetMetadata;
  }

  get domains() { return domains; }

  get subscriptionKey() { return this._subscriptionKey; }
  set subscriptionKey(newSubscriptionKey) { this._subscriptionKey = newSubscriptionKey; }

  get domain() { return this._domain; }
  set domain(newDomain) { this._domain = newDomain; }

  get mapConfigurationList() { return this._mapConfigurationList; }
  set mapConfigurationList(newmapConfigurationList) { this._mapConfigurationList = newmapConfigurationList; }

  get mapConfigurationName() { return this._mapConfigurationName; }
  set mapConfigurationName(newmapConfigurationName) { this._mapConfigurationName = newmapConfigurationName; }

  get mapConfiguration() { return this._mapConfiguration; }
  set mapConfiguration(newMapConfiguration) {
    this._mapConfiguration = newMapConfiguration;
  }

  get styleTupleIndex() { return this._styleTupleIndex; }
  set styleTupleIndex(newStyleTupleIndex) { this._styleTupleIndex = newStyleTupleIndex; }

  get styleAlias() { return this._styleAlias; }
  set styleAlias(newStyleAlias) { this._styleAlias = newStyleAlias; }

  get styleDescription() { return this._styleDescription; }
  set styleDescription(newStyleDescription) { this._styleDescription = newStyleDescription; }

  get mapConfigurationAlias() { return this._mapConfigurationAlias; }
  set mapConfigurationAlias(newMapConfigurationAlias) { this._mapConfigurationAlias = newMapConfigurationAlias; }

  get mapConfigurationDescription() { return this._mapConfigurationDescription; }
  set mapConfigurationDescription(newMapConfigurationDescription) { this._mapConfigurationDescription = newMapConfigurationDescription; }

  get requestHeaders() { return this._styleTupleIndex ? { 'subscription-key': this._subscriptionKey } : {}; }

  transformUrl(url) {
    if (this._styleTupleIndex && url)
    {
      if (url.startsWith(fakeDomainForSprite)) {
        return this._style.getSpriteUrl(url);
      }
      let newUrl = url.replace('{{azMapsDomain}}', this._domain).replace('{{azMapsLanguage}}', this._language).replace('{{azMapsView}}', this._view);
      if (!newUrl.includes("api-version")) {
        newUrl = newUrl + "?api-version=" + apiVersion;
      }
      return newUrl;
    }
    else
    {
      return url;
    }
  }

  transformRequest(url, resourceType) {
    return this._styleTupleIndex ? {
      url: this.transformUrl(url),
      headers: {'subscription-key': this._subscriptionKey}
    } : {
      url: url
    }
  }

  async createResultingStyle(
    subscriptionKey,
    domain,
    mapConfigurationList,
    mapConfigurationName,
    mapConfiguration,
    styleTupleIndex,
    errorResponseJsonPromise,
    canceled) {

    const styleTupleDetails = mapConfiguration.getStyleTupleDetails(parseInt(styleTupleIndex));
    if (!styleTupleDetails) {
      throw new Error('Got invalid style tuple index: ' + styleTupleIndex);
    }

    let resultingStyle = {
      "version": 8,
      "name": mapConfiguration.styleTuples[parseInt(styleTupleIndex)],
      "metadata": {
        "type": "Azure Maps style"
      },
      "sources": {},
      "sprite": fakeDomainForSprite,
      "glyphs": "https://" + domain + "/styles/glyphs/{fontstack}/{range}.pbf",
      "layers": []
    };

    const styleName = styleTupleDetails.styleId;
    let style = new AzureMapsStyle();
    await style.load(await getStyle(domain, styleName, subscriptionKey, canceled));

    const tilesetName = styleTupleDetails.tilesetId;
    let tilesetMetadata = new AzureMapsTilesetMetadata(await getTilesetMetadata(domain, tilesetName, subscriptionKey, canceled));

    // Get style alias and description
    let styleAlias = "custom_style";
    let styleDescription = "Custom style created in Azure Maps style editor";
    for (const styleMetadata of (await listStyles(domain, subscriptionKey, canceled)).styles) {
      if (styleMetadata.styleId === styleName || styleMetadata.alias === styleName)
      {
        styleAlias = styleMetadata.alias;
        styleDescription = styleMetadata.description;
      }
    }

    // Get map configuration alias and description
    let mapConfigurationAlias = "custom_map_configuration";
    let mapConfigurationDescription = "Custom map configuration created in Azure Maps style editor";
    for (const mapConfigurationEntry of mapConfigurationList) {
      if (mapConfigurationEntry.mapConfigurationId === mapConfigurationName || mapConfigurationEntry.alias === mapConfigurationName)
      {
        mapConfigurationAlias = mapConfigurationEntry.alias;
        mapConfigurationDescription = mapConfigurationEntry.description;
      }
    }

    // Check base map
    console.log(styleTupleDetails.style.baseMap);

    resultingStyle.sources[tilesetName] = {
      type: "vector",
      tiles: [ "https://" + domain + "/map/tile?api-version=2.0&tilesetId=" + tilesetName + "&zoom={z}&x={x}&y={y}" ],
      minzoom: tilesetMetadata.minZoom,
      maxzoom: tilesetMetadata.maxZoom
    };

    resultingStyle.layers = style.layers;
    resultingStyle.layers.forEach(layer => {
      // make sure indoor layers are visible
      if ((layer.type !== "fill-extrusion") && layer.metadata && indoorLayers.has(layer.metadata["microsoft.maps:layerGroup"]))
      {
        layer.layout.visibility = "visible"
      }
      layer.source = tilesetName;
    });

    resultingStyle.center = [
      (tilesetMetadata.bbox[0] + tilesetMetadata.bbox[2]) / 2,
      (tilesetMetadata.bbox[1] + tilesetMetadata.bbox[3]) / 2 ];
    resultingStyle.zoom = (tilesetMetadata.minZoom + tilesetMetadata.maxZoom) / 2;

    if (canceled) return null;

    this._subscriptionKey = subscriptionKey;
    this._domain = domain;
    this._mapConfigurationList = mapConfigurationList;
    this._mapConfigurationName = mapConfigurationName;
    this._mapConfiguration = mapConfiguration;
    this._mapConfigurationAlias = mapConfigurationAlias;
    this._mapConfigurationDescription = mapConfigurationDescription;
    this._styleTupleIndex = styleTupleIndex;
    this._style = style;
    this._styleAlias = styleAlias;
    this._styleDescription = styleDescription;
    this._tilesetMetadata = tilesetMetadata;
    return resultingStyle;
  }

  getUpdatedStyle(newStyle) {
    let style = {
      "layers": newStyle.layers
    };

    style.layers.forEach(layer => {
      // make sure indoor layers are hidden
      if ((layer.type !== "fill-extrusion") && layer.metadata && indoorLayers.has(layer.metadata["microsoft.maps:layerGroup"]))
      {
        layer.layout.visibility = "none"
      }
      delete layer.source;
    });

    return this._style.updateAndGenerateZip(style);
  }

  async uploadResultingStyle(newStyle) {
    const blob = await this.getUpdatedStyle(newStyle);

    let oldStyleId = "";
    for (const styleMetadata of (await listStyles(this._domain, this._subscriptionKey)).styles) {
      if (styleMetadata.alias === this._styleAlias) {
        oldStyleId = styleMetadata.styleId;
      }
    }

    const newStyleId = await createStyle(this._domain, this._styleAlias, this._styleDescription, blob, this._subscriptionKey);

    if (oldStyleId) {
      await deleteStyle(this._domain, oldStyleId, this._subscriptionKey);
    }

    return newStyleId;
  }

  async getUpdatedMapConfiguration() {
    this._mapConfiguration.updateStyleTupleDetails(this._styleTupleIndex, null, null, this._styleAlias);
    return this._mapConfiguration.generateZip();
  }

  async uploadResultingMapConfiguration() {
    const blob = await this.getUpdatedMapConfiguration();

    let oldMapConfigurationId = "";
    for (const mapConfigurationMetadata of (await listMapConfigurations(this._domain, this._subscriptionKey)).mapConfigurations) {
      if (mapConfigurationMetadata.alias === this._mapConfigurationAlias) {
        oldMapConfigurationId = mapConfigurationMetadata.mapConfigurationId;
      }
    }

    const newMapConfigurationId = await createMapConfiguration(this._domain, this._mapConfigurationAlias, this._mapConfigurationDescription, blob, this._subscriptionKey);

    if (oldMapConfigurationId) {
      await deleteMapConfiguration(this._domain, oldMapConfigurationId, this._subscriptionKey);
    }

    return newMapConfigurationId;
  }
}

export default {
  listMapConfigurations,
  getMapConfiguration,
  ensureMapConfigurationListValidity,
  AzureMapsMapConfiguration,
  AzureMapsExtension
}