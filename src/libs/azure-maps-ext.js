import JSZip from 'jszip'
import pako from 'pako'

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

// Azure Maps REST API URLs:
function getTilesetMetadata(domain, tilesetId) { return "https://" + domain + "/tilesets/" + tilesetId + "?api-version=" + apiVersion; }
function createStyleRecipe(domain, dataFormat, description, alias) { return "https://" + domain + "/styles/styleRecipes?api-version=" + apiVersion + "&dataFormat=" + dataFormat + "&styleFormat=azureMapsStyle&description=" + description + "&alias=" + alias; }
function listStyleRecipes(domain) { return "https://" + domain + "/styles/styleRecipes?api-version=" + apiVersion; }
function getStyleRecipe(domain, styleRecipeName) { return "https://" + domain + "/styles/styleRecipes/" + styleRecipeName + "?api-version=" + apiVersion + "&styleFormat=azureMapsStyle"; }
function listStyleSets(domain) { return "https://" + domain + "/styles/styleSets?api-version=" + apiVersion; }
function getStyleSet(domain, styleSetName) { return "https://" + domain + "/styles/styleSets/" + styleSetName + "?api-version=" + apiVersion; }
function getStyleSetStyle(styleUrl) { return styleUrl + "?api-version=" + apiVersion + "&styleFormat=mapbox"; }

function ensureStyleSetListValidity(styleSetList) {
  return {
    styleSets: [
      {
        "styleSetId": "0a1a2bce-554c-a941-e0eb-5709b6168584",
        "description": "The default Azure Maps style set",
        "alias": "microsoft-maps:default",
        "created": "2022-03-24T13:07:39+00:00"
      },
      ...styleSetList.styleSets
    ]
  };
}

function ensureStyleSetValidity(styleSet) {
  return styleSet;
}

function ensureStyleSetStyleValidity(styleSetStyle, domain) {
  styleSetStyle.layers.forEach(layer => {
    // make sure indoor layers are visible
    if ((layer.type !== "fill-extrusion") && layer.metadata && indoorLayers.has(layer.metadata["microsoft.maps:layerGroup"]))
    {
      layer.layout.visibility = "visible"
    }
  })
  return styleSetStyle;
}

function extractStyleTuples(styleSet) {
  var styleTuples = [];
  for (const style of styleSet.styles) {
    for (const tuple of style.layers) {
      styleTuples.push(tuple.styleRecipeId + " + " + tuple.tilesetId);
    }
  }
  return styleTuples;
}

class AzureMapsStyleRecipe {

  constructor() {
    this._zip = null;
    this._json = null;
    this._jsonFileName = "";
    this._spriteJsonFiles = {};
  }

  get layers() { return this._json?.layers; }

  async load(styleRecipeBlob)
  {
    this._zip = await JSZip.loadAsync(styleRecipeBlob);

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
      console.error("There must be a single JSON file being the style recipe. " + jsons.size + " JSON files found.");
      return;
    }

    // load style recipe
    this._jsonFileName = jsons.values().next().value + ".json";
    this._json = JSON.parse(await this._zip.file(this._jsonFileName).async("string"));

    // WORKAROUND - incorrectly GZipped sprite index files ... :/
    for (const imageName of pngs) {
      const spriteIndexFileName = imageName + ".json";
      this._spriteJsonFiles[spriteIndexFileName] = pako.inflate(await this._zip.file(spriteIndexFileName).async("Uint8Array"));
    }
    console.log(this._spriteJsonFiles);
  }

  updateAndGenerateZip(styleRecipeJson)
  {
    this._zip.file(this._jsonFileName, styleRecipeJson);
    // WORKAROUND - incorrectly GZipped sprite index files ... :/
    for (const spriteIndexFileName in this._spriteJsonFiles) {
      this._zip.file(spriteIndexFileName, this._spriteJsonFiles[spriteIndexFileName]);
    }
    return this._zip.generateAsync({type: "blob"});
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

const defaultStyleSetList = {
  "styleSets": [
  ]
};

const defaultStyleSet = {
  "id": "00000000-0000-0000-0000-000000000000",
  "version": 1.0,
  "description": "",
  "created": "2022-03-24T13:07:45.2042746+00:00",
  "defaultStyle": "",
  "styles": [
  ]
};

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

class AzureMapsExtension {

  constructor() {
    this._subscriptionKey = "";
    this._domain = domains[0];
    this._styleSetList = defaultStyleSetList;
    this._styleSetName = "";
    this._styleSet = defaultStyleSet;
    this._styleTuples = [];
    this._resultingStyleName = "";
    this._resultingStyle;
    this._language = "en-us";
    this._view = "Unified";
    this._tilesetMetadata;

    this.transformUrl = this.transformUrl.bind(this)
    this.transformRequest = this.transformRequest.bind(this)
    this.createResultingStyle = this.createResultingStyle.bind(this)
    this.getUpdatedStyle = this.getUpdatedStyle.bind(this)
    this.uploadResultingStyle = this.uploadResultingStyle.bind(this)
  }

  get domains() { return domains; }

  get subscriptionKey() { return this._subscriptionKey; }
  set subscriptionKey(newSubscriptionKey) { this._subscriptionKey = newSubscriptionKey; }

  get domain() { return this._domain; }
  set domain(newDomain) { this._domain = newDomain; }

  get styleSetList() { return this._styleSetList; }
  set styleSetList(newstyleSetList) { this._styleSetList = newstyleSetList; }

  get styleSetName() { return this._styleSetName; }
  set styleSetName(newstyleSetName) { this._styleSetName = newstyleSetName; }

  get styleSet() { return this._styleSet; }
  set styleSet(newStyleSet) {
    this._styleSet = newStyleSet;
    this._styleTuples = extractStyleTuples(newStyleSet);
  }

  get styleTuples() { return this._styleTuples; }

  get resultingStyleName() { return this._resultingStyleName; }

  get resultingStyle() { return this._resultingStyle; }

  get resultingStyleDescription() { return this._resultingStyleDescription; }

  get resultingStyleAlias() { return this._resultingStyleAlias; }

  get requestHeaders() { return this._resultingStyle ? { 'subscription-key': this._subscriptionKey } : {}; }

  transformUrl(url) {
    console.log(url);
    if (this._resultingStyle && url)
    {
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
    return this._resultingStyle ? {
      url: this.transformUrl(url),
      headers: {'subscription-key': this._subscriptionKey}
    } : {
      url: url
    }
  }

  async createResultingStyle(resultingStyleName) {
    this._resultingStyleName = resultingStyleName;
    this._resultingStyle = {
      "version": 8,
      "name": resultingStyleName,
      "metadata": {},
      "sources": {},
      "glyphs": "https://" + this._domain + "/styles/glyphs/{fontstack}/{range}.pbf",
      "layers": []
    };

    const styleTuple = resultingStyleName.split(" + ");
    if (styleTuple.length != 2) {
      return this._resultingStyle;
    }

    console.log(styleTuple);

    const styleRecipeName = styleTuple[0];
    var styleRecipeResponse = await fetch(getStyleRecipe(this._domain, styleRecipeName), {
      mode: 'cors',
      headers: {'subscription-key': this._subscriptionKey},
      credentials: "same-origin"
    });
    this._styleRecipe = new AzureMapsStyleRecipe();
    await this._styleRecipe.load(await styleRecipeResponse.blob());

    console.log(this._styleRecipe);

    const tilesetName = styleTuple[1];
    var tilesetMetadataResponse = await fetch(getTilesetMetadata(this._domain, tilesetName), {
      mode: 'cors',
      headers: {'subscription-key': this._subscriptionKey},
      credentials: "same-origin"
    });
    this._tilesetMetadata = new AzureMapsTilesetMetadata(await tilesetMetadataResponse.json());

    console.log(this._tilesetMetadata);

    // Get alias and description
    var styleRecipesResponse = await fetch(listStyleRecipes(this._domain), {
      mode: 'cors',
      headers: {'subscription-key': this._subscriptionKey},
      credentials: "same-origin"
    });
    for (const styleRecipeMetadata of (await styleRecipesResponse.json()).styleRecipes) {
      if (styleRecipeMetadata.styleRecipeId === styleRecipeName || styleRecipeMetadata.alias === styleRecipeName)
      {
        this._resultingStyleDescription = styleRecipeMetadata.description;
        this._resultingStyleAlias = styleRecipeMetadata.alias;
      }
    }

    this._resultingStyle.sources[tilesetName] = {
      type: "vector",
      tiles: [ "https://" + this._domain + "/map/tile?api-version=2.0&tilesetId=" + tilesetName + "&zoom={z}&x={x}&y={y}" ],
      minzoom: this._tilesetMetadata.minZoom,
      maxzoom: this._tilesetMetadata.maxZoom
    };

    this._resultingStyle.layers = this._styleRecipe.layers;
    this._resultingStyle.layers.forEach(layer => {
      // make sure indoor layers are visible
      if ((layer.type !== "fill-extrusion") && layer.metadata && indoorLayers.has(layer.metadata["microsoft.maps:layerGroup"]))
      {
        layer.layout.visibility = "visible"
      }
      layer.source = tilesetName;
    });

    this._resultingStyle.center = [
      (this._tilesetMetadata.bbox[0] + this._tilesetMetadata.bbox[2]) / 2,
      (this._tilesetMetadata.bbox[1] + this._tilesetMetadata.bbox[3]) / 2 ];
    this._resultingStyle.zoom = (this._tilesetMetadata.minZoom + this._tilesetMetadata.maxZoom) / 2;

    return this._resultingStyle;
  }

  getUpdatedStyle() {
    let styleRecipe = {
      "layers": this._resultingStyle?.layers
    };

    styleRecipe.layers.forEach(layer => {
      // make sure indoor layers are hidden
      if ((layer.type !== "fill-extrusion") && layer.metadata && indoorLayers.has(layer.metadata["microsoft.maps:layerGroup"]))
      {
        layer.layout.visibility = "none"
      }
      delete layer.source;
    });

    return this._styleRecipe.updateAndGenerateZip(JSON.stringify(styleRecipe));
  }

  async uploadResultingStyle(styleDescription, styleAlias) {
    const blob = await this.getUpdatedStyle();

    // Upload new style recipe
    let styleRecipeResponse = await fetch(createStyleRecipe(this._domain, "zip", styleDescription, styleAlias), {
      method: 'POST',
      mode: 'cors',
      headers: {'subscription-key': this._subscriptionKey},
      credentials: "same-origin",
      body: blob
    });

    if (!styleRecipeResponse.ok || !styleRecipeResponse.headers.has("operation-location")) {
      console.log(styleRecipeResponse)
      return "";
    }

    const statusUrl = styleRecipeResponse.headers.get("operation-location");
    while (true) {
      await delay(1000);
      let styleRecipeStatusResponse = await fetch(statusUrl, {
        mode: 'cors',
        headers: {'subscription-key': this._subscriptionKey},
        credentials: "same-origin"
      });
      console.log(styleRecipeStatusResponse);
      console.log(styleRecipeStatusResponse.headers)
      if (!styleRecipeStatusResponse.ok) {
        console.log(await styleRecipeStatusResponse.json());
        return "";
      }
      if (styleRecipeStatusResponse.headers.has('resource-location')) {
        return styleRecipeStatusResponse.headers.get('resource-location');
      }
      const jsonResponse = await styleRecipeStatusResponse.json();
      if (jsonResponse.status !== "Running")
      {
        console.log(jsonResponse);
        return "";
      }
    }
  }
}

export default {
  listStyleSets,
  getStyleSet,
  getStyleSetStyle,
  ensureStyleSetListValidity,
  ensureStyleSetValidity,
  ensureStyleSetStyleValidity,
  extractStyleTuples,
  AzureMapsExtension
}