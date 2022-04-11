const apiVersion = "2022-01-01-preview";

const domains = [
  "us.atlas.microsoft.com",
  "eu.atlas.microsoft.com",
  "us.t-azmaps.azurelbs.com",
  "eu.t-azmaps.azurelbs.com"
];

function getStyleSetList(domain) { return "https://" + domain + "/styles/styleSets?api-version=" + apiVersion; }

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

function getStyleSet(domain, styleSetName) { return "https://" + domain + "/styles/styleSets/" + styleSetName + "?api-version=" + apiVersion; }

function ensureStyleSetValidity(styleSet) {
  return styleSet;
}

function getStyleSetStyle(styleUrl) { return styleUrl + "?api-version=" + apiVersion + "&styleFormat=mapbox"; }

function ensureStyleSetStyleValidity(styleSetStyle, domain) {
  for(let [key, val] of Object.entries(styleSetStyle.sources)) {
    if(styleSetStyle.sources.hasOwnProperty(key) && val.hasOwnProperty("url")) {
      val.url = val.url.replace('{{azMapsDomain}}', domain);
    }
  }

  return styleSetStyle;
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

class AzureMapsExtension {

  constructor() {
    this._subscriptionKey = "";
    this._subscriptionKeyModified = false;
    this._domain = domains[0];
    this._styleSetList = defaultStyleSetList;
    this._styleSetName = "";
    this._styleUrl = "";
    this._styleSet = defaultStyleSet;
    this._language = "en-us";
    this._view = "Unified";

    this.transformUrl = this.transformUrl.bind(this)
    this.transformRequest = this.transformRequest.bind(this)
  }

  get domains() { return domains; }

  get subscriptionKey() { return this._subscriptionKey; }
  set subscriptionKey(newSubscriptionKey) {
    this._subscriptionKeyModified = (this._subscriptionKey !== newSubscriptionKey);
    this._subscriptionKey = newSubscriptionKey;
  }

  get subscriptionKeyModified() { return this._subscriptionKeyModified; }

  get domain() { return this._domain; }
  set domain(newDomain) { this._domain = newDomain; }

  get styleSetList() { return this._styleSetList; }
  set styleSetList(newstyleSetList) { this._styleSetList = newstyleSetList; }

  get styleSetName() { return this._styleSetName; }
  set styleSetName(newstyleSetName) { this._styleSetName = newstyleSetName; }

  get styleUrl() { return this._styleUrl; }
  set styleUrl(newstyleUrl) { this._styleUrl = newstyleUrl; }

  get styleSet() { return this._styleSet; }
  set styleSet(newStyleSet) { this._styleSet = newStyleSet; }

  get requestHeaders() { return this._styleUrl ? { 'subscription-key': this._subscriptionKey } : {}; }

  transformUrl(url) {
    if (this._styleUrl)
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
    console.log(url + " key: " + this._subscriptionKey);
    return this._styleUrl ? {
      url: this.transformUrl(url),
      headers: {'subscription-key': this._subscriptionKey}
    } : {
      url: url
    }
  }

}

export default {
  AzureMapsExtension,
  getStyleSetList,
  ensureStyleSetListValidity,
  getStyleSet,
  ensureStyleSetValidity,
  getStyleSetStyle,
  ensureStyleSetStyleValidity
}