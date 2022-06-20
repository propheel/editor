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
function getTilesetMetadata(domain, tilesetId) { return "https://" + domain + "/tilesets/" + tilesetId + "?api-version=" + apiVersion; }
function createStyleRecipe(domain, dataFormat, description, alias) { return "https://" + domain + "/styles?api-version=" + apiVersion + "&dataFormat=" + dataFormat + "&styleFormat=azureMapsStyle&description=" + description + "&alias=" + alias; }
function listStyleRecipes(domain) { return "https://" + domain + "/styles?api-version=" + apiVersion; }
function getStyleRecipe(domain, styleRecipeName) { return "https://" + domain + "/styles/" + styleRecipeName + "?api-version=" + apiVersion + "&styleFormat=azureMapsStyle"; }
function listStyleSets(domain) { return "https://" + domain + "/styles/mapConfigurations?api-version=" + apiVersion; }
function getStyleSet(domain, styleSetName) { return "https://" + domain + "/styles/mapConfigurations/" + styleSetName + "?api-version=" + apiVersion; }

function ensureStyleSetListValidity(styleSetList) {
  return styleSetList;
}

function ensureStyleSetValidity(styleSet) {
  return styleSet;
}

function extractStyleTuples(styleSet) {
  var styleTuples = new Set();
  for (const style of styleSet.styles) {
    for (const tuple of style.layers) {
      styleTuples.add(tuple.styleId + " + " + tuple.tilesetId);
    }
  }
  return Array.from(styleTuples);
}

class AzureMapsStyleRecipe {

  constructor() {
    this._zip = null;
    this._json = null;
    this._jsonFileName = "";
    this._spriteSheets = {};
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

    // Load sprite sheets into memory
    for (const imageName of pngs) {
      const pixelRatio = imageName.endsWith("@2x") ? "2" : "1";
      this._spriteSheets[pixelRatio + ".json"] = URL.createObjectURL(await this._zip.file(imageName + ".json").async("blob"));
      this._spriteSheets[pixelRatio + ".png"] = URL.createObjectURL(await this._zip.file(imageName + ".png").async("blob"));
    }

    // load style recipe
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

  updateAndGenerateZip(styleRecipeJson)
  {
    this._zip.file(this._jsonFileName, styleRecipeJson);
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
  set resultingStyle(newResultingStyle) { this._resultingStyle = newResultingStyle; }

  get resultingStyleDescription() { return this._resultingStyleDescription; }

  get resultingStyleAlias() { return this._resultingStyleAlias; }

  get requestHeaders() { return this._resultingStyle ? { 'subscription-key': this._subscriptionKey } : {}; }

  transformUrl(url) {
    if (this._resultingStyle && url)
    {
      if (url.startsWith(fakeDomainForSprite)) {
        return this._styleRecipe.getSpriteUrl(url);
      }
      let newUrl = url.replace('{{azMapsDomain}}', this._domain).replace('{{azMapsLanguage}}', this._language).replace('{{azMapsView}}', this._view).replace('styles/styleSets', 'styles/mapConfigurations');
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

  async createResultingStyle(
    subscriptionKey,
    domain,
    styleSetList,
    styleSetName,
    styleSet,
    resultingStyleName,
    errorResponseJsonPromise,
    canceled) {
    let resultingStyle = {
      "version": 8,
      "name": resultingStyleName,
      "metadata": {
        "type": "Azure Maps style"
      },
      "sources": {},
      "sprite": fakeDomainForSprite,
      "glyphs": "https://" + domain + "/styles/glyphs/{fontstack}/{range}.pbf",
      "layers": []
    };

    const styleTuple = resultingStyleName.split(" + ");
    if (styleTuple.length != 2) {
      throw new Error('Got invalid resulting style name: ' + resultingStyleName);
    }

    const styleRecipeName = styleTuple[0];
    let styleRecipeResponse = await fetch(getStyleRecipe(domain, styleRecipeName), {
      mode: 'cors',
      headers: {'subscription-key': subscriptionKey},
      credentials: "same-origin"
    });
    if (canceled) return null;
    if (!styleRecipeResponse.ok) {
      errorResponseJsonPromise = styleRecipeResponse.json();
      throw new Error('Response is not OK');
    }
    let styleRecipe = new AzureMapsStyleRecipe();
    await styleRecipe.load(await styleRecipeResponse.blob());

    const tilesetName = styleTuple[1];
    let tilesetMetadataResponse = await fetch(getTilesetMetadata(domain, tilesetName), {
      mode: 'cors',
      headers: {'subscription-key': subscriptionKey},
      credentials: "same-origin"
    });
    if (canceled) return null;
    if (!tilesetMetadataResponse.ok) {
      errorResponseJsonPromise = tilesetMetadataResponse.json();
      throw new Error('Response is not OK');
    }
    let tilesetMetadata = new AzureMapsTilesetMetadata(await tilesetMetadataResponse.json());

    // Get alias and description
    var styleRecipesResponse = await fetch(listStyleRecipes(domain), {
      mode: 'cors',
      headers: {'subscription-key': subscriptionKey},
      credentials: "same-origin"
    });
    if (canceled) return null;
    if (!styleRecipesResponse.ok) {
      errorResponseJsonPromise = styleRecipesResponse.json();
      throw new Error('Response is not OK');
    }
    for (const styleRecipeMetadata of (await styleRecipesResponse.json()).styles) {
      if (styleRecipeMetadata.styleId === styleRecipeName || styleRecipeMetadata.alias === styleRecipeName)
      {
        resultingStyleDescription = styleRecipeMetadata.description;
        resultingStyleAlias = styleRecipeMetadata.alias;
      }
    }

    resultingStyle.sources[tilesetName] = {
      type: "vector",
      tiles: [ "https://" + domain + "/map/tile?api-version=2.0&tilesetId=" + tilesetName + "&zoom={z}&x={x}&y={y}" ],
      minzoom: tilesetMetadata.minZoom,
      maxzoom: tilesetMetadata.maxZoom
    };

    resultingStyle.layers = styleRecipe.layers;
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
    this._styleSetList = styleSetList;
    this._styleSetName = styleSetName;
    this._styleSet = styleSet;
    this._styleRecipe = styleRecipe;
    this._tilesetMetadata = tilesetMetadata;
    this._resultingStyleName = resultingStyleName;
    return this._resultingStyle = resultingStyle;
  }

  getUpdatedStyle(newStyle) {
    let styleRecipe = {
      "layers": newStyle.layers
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

  async uploadResultingStyle(newStyle, styleDescription, styleAlias) {
    const blob = await this.getUpdatedStyle(newStyle);

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
  ensureStyleSetListValidity,
  ensureStyleSetValidity,
  extractStyleTuples,
  AzureMapsExtension
}