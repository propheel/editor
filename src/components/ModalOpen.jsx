import React from 'react'
import PropTypes from 'prop-types'
import ModalLoading from './ModalLoading'
import Modal from './Modal'
import InputButton from './InputButton'
import InputString from './InputString'
import InputSelect from './InputSelect'
import FileReaderInput from 'react-file-reader-input'
import InputUrl from './InputUrl'

import {MdFileUpload} from 'react-icons/md'
import {MdAddCircleOutline} from 'react-icons/md'

import style from '../libs/style.js'
import publicStyles from '../config/styles.json'
import azureMapsExt from '../libs/azure-maps-ext'
import JSZip from 'jszip'

class PublicStyle extends React.Component {
  static propTypes = {
    url: PropTypes.string.isRequired,
    thumbnailUrl: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    onSelect: PropTypes.func.isRequired,
  }

  render() {
    return <div className="maputnik-public-style">
      <InputButton
        className="maputnik-public-style-button"
        aria-label={this.props.title}
        onClick={() => this.props.onSelect(this.props.url)}
      >
        <div className="maputnik-public-style-header">
          <div>{this.props.title}</div>
          <span className="maputnik-space" />
          <MdAddCircleOutline />
        </div>
        <div
          className="maputnik-public-style-thumbnail"
          style={{
            backgroundImage: `url(${this.props.thumbnailUrl})`
          }}
        ></div>
      </InputButton>
    </div>
  }
}

export default class ModalOpen extends React.Component {
  static propTypes = {
    isOpen: PropTypes.bool.isRequired,
    azureMapsExtension: PropTypes.object.isRequired,
    onOpenToggle: PropTypes.func.isRequired,
    onStyleOpen: PropTypes.func.isRequired,
  }

  constructor(props) {
    super(props);
    this.state = {
      styleUrl: "",
      azMapsKey: props.azureMapsExtension.subscriptionKey,
      azMapsDomain: props.azureMapsExtension.domain,
      azMapsStyleSetList: props.azureMapsExtension.styleSetList.mapConfigurations,
      azMapsStyleSetName: props.azureMapsExtension.styleSetName,
      azMapsStyleSet: props.azureMapsExtension.styleSet,
      azMapsStyleTuples: props.azureMapsExtension.styleTuples,
      azMapsResultingStyleName: props.azureMapsExtension.resultingStyleName
    };
  }

  clearError() {
    this.setState({
      error: null
    })
  }

  onCancelActiveRequest(e) {
    // Else the click propagates to the underlying modal
    if(e) e.stopPropagation();

    if(this.state.activeRequest) {
      this.state.activeRequest.abort();
      this.setState({
        activeRequest: null,
        activeRequestUrl: null
      });
    }
  }

  onStyleSelect = (styleUrl) => {
    this.clearError();

    let canceled;

    fetch(styleUrl, {
      mode: 'cors',
      credentials: "same-origin"
    })
    .then(function(response) {
      return response.json();
    })
    .then((body) => {
      if(canceled) {
        return;
      }

      this.setState({
        activeRequest: null,
        activeRequestUrl: null
      });

      const mapStyle = style.ensureStyleValidity(body)
      console.log('Loaded style ', mapStyle.id)
      this.props.onStyleOpen(mapStyle)
      this.onOpenToggle()
    })
    .catch((err) => {
      this.setState({
        error: `Failed to load: '${styleUrl}'`,
        activeRequest: null,
        activeRequestUrl: null
      });
      console.error(err);
      console.warn('Could not open the style URL', styleUrl)
    })

    this.setState({
      activeRequest: {
        abort: function() {
          canceled = true;
        }
      },
      activeRequestUrl: styleUrl
    })
  }

  onSubmitUrl = (e) => {
    e.preventDefault();
    this.onStyleSelect(this.state.styleUrl);
  }

  onUpload = (_, files) => {
    const [e, file] = files[0];
    const reader = new FileReader();

    this.clearError();

    reader.readAsText(file, "UTF-8");
    reader.onload = e => {
      let mapStyle;
      try {
        mapStyle = JSON.parse(e.target.result)
      }
      catch(err) {
        this.setState({
          error: err.toString()
        });
        return;
      }
      mapStyle = style.ensureStyleValidity(mapStyle)
      this.props.onStyleOpen(mapStyle);
      this.onOpenToggle();
    }
    reader.onerror = e => console.log(e.target);
  }

  onOpenToggle() {
    this.setState({
      styleUrl: ""
    });
    this.clearError();
    this.props.onOpenToggle();
  }

  onChangeUrl = (url) => {
    this.setState({
      styleUrl: url,
    });
  }

  onChangeAzureMapsSubscriptionKey = (key) => {
    this.setState({
      azMapsKey: key
    })
  }

  onChangeAzureMapsDomain = (domain) => {
    this.setState({
      azMapsDomain: domain
    })
  }

  onSubmitAzureMapsStyleSetList = (e) => {
    e.preventDefault();

    this.clearError();

    let canceled;
    let errResponseJsonPromise;

    fetch(azureMapsExt.listStyleSets(this.state.azMapsDomain), {
      mode: 'cors',
      headers: {'subscription-key': this.state.azMapsKey},
      credentials: "same-origin"
    })
    .then(function(response) {
      if (!response.ok) {
        errResponseJsonPromise = response.json();
        throw new Error('Response is not OK');
      }
      return response.json();
    })
    .then((body) => {
      if(canceled) {
        return;
      }

      this.setState({
        activeRequest: null,
        activeRequestUrl: null
      });

      const styleSetList = azureMapsExt.ensureStyleSetListValidity(body)
      console.log('Loaded Azure Maps map configuration list with ' + styleSetList.mapConfigurations.length + ' entries.')

      this.setState({
        azMapsStyleSetList: styleSetList.mapConfigurations,
        azMapsStyleSetName: styleSetList.mapConfigurations.length ? styleSetList.mapConfigurations[0].alias || styleSetList.mapConfigurations[0].mapConfigurationId : ""
      })
    })
    .catch(async (err) => {
      let errorMessage = 'Failed to load Azure Maps map configuration list';
      if (errResponseJsonPromise)
      {
        let errResponseJson = await errResponseJsonPromise;
        if (errResponseJson?.error?.message) {
          errorMessage = errResponseJson.error.message;
        }
      }
      this.setState({
        error: errorMessage,
        activeRequest: null,
        activeRequestUrl: null
      })
      console.error(err)
      console.warn('Could not fetch the map configuration list')
    })

    this.setState({
      activeRequest: {
        abort: function() {
          canceled = true;
        }
      },
      activeRequestUrl: azureMapsExt.listStyleSets(this.state.azMapsDomain)
    })
  }

  onChangeAzureMapsStyleSetName = (styleSetName) => {
    this.setState({
      azMapsStyleSetName: styleSetName
    })
  }

  onSubmitAzureMapsStyleSet = (e) => {
    e.preventDefault();

    this.clearError();

    let canceled;
    let errResponseJsonPromise;

    fetch(azureMapsExt.getStyleSet(this.state.azMapsDomain, this.state.azMapsStyleSetName), {
      mode: 'cors',
      headers: {'subscription-key': this.state.azMapsKey},
      credentials: "same-origin"
    })
    .then(function(response) {
      if (!response.ok) {
        errResponseJsonPromise = response.json();
        throw new Error('Response is not OK');
      }
      return response.blob();
    })
    .then(JSZip.loadAsync)
    .then((zip) => {
      for (const zipEntry in zip.files) {
        if (zipEntry.toLowerCase().endsWith(".json")) {
          zip.file(zipEntry).async("string").then((styleSetBody) => {
            const styleSet = azureMapsExt.ensureStyleSetValidity(JSON.parse(styleSetBody));

            if(canceled) {
              return;
            }

            this.setState({
              activeRequest: null,
              activeRequestUrl: null
            });

            console.log('Loaded Azure Maps map configuration ' + this.state.azMapsStyleSetName + ' with ' + styleSet.styles.length + ' styles.')

            const styleTuples = azureMapsExt.extractStyleTuples(styleSet);

            this.setState({
              azMapsStyleSet: styleSet,
              azMapsStyleTuples: styleTuples,
              azMapsResultingStyleName: (styleTuples.length) ? styleTuples[0] : ""
            })
          })
        }
      }
    })
    .catch(async (err) => {
      let errorMessage = 'Failed to load Azure Maps map configuration';
      if (errResponseJsonPromise)
      {
        let errResponseJson = await errResponseJsonPromise;
        if (errResponseJson?.error?.message) {
          errorMessage = errResponseJson.error.message;
        }
      }
      this.setState({
        error: errorMessage,
        activeRequest: null,
        activeRequestUrl: null
      })
      console.error(err)
      console.warn('Could not fetch the map configuration')
    })

    this.setState({
      activeRequest: {
        abort: function() {
          canceled = true;
        }
      },
      activeRequestUrl: azureMapsExt.getStyleSet(this.state.azMapsDomain, this.state.azMapsStyleSetName)
    })
  }

  onChangeAzureMapsResultingStyleName = (resultingStyleName) => {
    this.setState({
      azMapsResultingStyleName: resultingStyleName
    })
  }

  onSubmitAzureMapsStyle = (e) => {
    e.preventDefault();

    this.clearError();

    let canceled;
    let errResponseJsonPromise;

    console.log('Loading Azure Maps resulting style: ' + this.state.azMapsResultingStyleName)

    this.props.azureMapsExtension.createResultingStyle(
      this.state.azMapsKey,
      this.state.azMapsDomain,
      this.state.azMapsStyleSetList,
      this.state.azMapsStyleSetName,
      this.state.azMapsStyleSet,
      this.state.azMapsResultingStyleName,
      errResponseJsonPromise,
      canceled)
    .then((resultingStyle) => {
      if(canceled) {
        return;
      }

      this.setState({
        activeRequest: null,
        activeRequestUrl: null
      });
      
      this.props.onStyleOpen(resultingStyle)
      this.onOpenToggle()
    })
    .catch(async (err) => {
      let errorMessage = 'Failed to load Azure Maps style';
      if (errResponseJsonPromise)
      {
        let errResponseJson = await errResponseJsonPromise;
        if (errResponseJson?.error?.message) {
          errorMessage = errResponseJson.error.message;
        }
      }
      this.setState({
        error: errorMessage,
        activeRequest: null,
        activeRequestUrl: null
      })
      console.error(err)
      console.warn('Could not fetch the style')
    })

    this.setState({
      activeRequest: {
        abort: function() {
          canceled = true;
        }
      },
      activeRequestUrl: "Azure Maps Style elements"
    })
  }

  render() {
    const styleOptions = publicStyles.map(style => {
      return <PublicStyle
        key={style.id}
        url={style.url}
        title={style.title}
        thumbnailUrl={style.thumbnail}
        onSelect={this.onStyleSelect}
      />
    })

    let errorElement;
    if(this.state.error) {
      errorElement = (
        <div className="maputnik-modal-error">
          {this.state.error}
          <a href="#" onClick={() => this.clearError()} className="maputnik-modal-error-close">×</a>
        </div>
      );
    }

    return (
      <div>
        <Modal
          data-wd-key="modal:open"
          isOpen={this.props.isOpen}
          onOpenToggle={() => this.onOpenToggle()}
          title={'Open Style'}
        >
          {errorElement}
          <section className="maputnik-modal-section">
            <h1>Upload Style</h1>
            <p>Upload a JSON style from your computer.</p>
            <FileReaderInput onChange={this.onUpload} tabIndex="-1" aria-label="Style file">
              <InputButton className="maputnik-upload-button"><MdFileUpload /> Upload</InputButton>
            </FileReaderInput>
          </section>

          <section className="maputnik-modal-section">
            <form onSubmit={this.onSubmitUrl}>
              <h1>Load from URL</h1>
              <p>
                Load from a URL. Note that the URL must have <a href="https://enable-cors.org" target="_blank" rel="noopener noreferrer">CORS enabled</a>.
              </p>
              <InputUrl
                aria-label="Style URL"
                data-wd-key="modal:open.url.input"
                type="text"
                className="maputnik-input"
                default="Enter URL..."
                value={this.state.styleUrl}
                onInput={this.onChangeUrl}
                onChange={this.onChangeUrl}
              />
              <div>
                <InputButton
                  data-wd-key="modal:open.url.button"
                  type="submit"
                  className="maputnik-big-button"
                  disabled={this.state.styleUrl.length < 1}
                >Load from URL</InputButton>
              </div>
            </form>
          </section>

          <section className="maputnik-modal-section maputnik-modal-section--shrink">
            <h1>Gallery Styles</h1>
            <p>
              Open one of the publicly available styles to start from.
            </p>
            <div className="maputnik-style-gallery-container">
            {styleOptions}
            </div>
          </section>

          <section className="maputnik-modal-section">
            <h1>Azure Maps styles</h1>

            <form onSubmit={this.onSubmitAzureMapsStyleSetList}>
              <div className="maputnik-style-gallery-container">
                <p>
                  Enter your Azure Maps subscription key.
                </p>
                <InputString
                  aria-label="Azure Maps subscription key for now. RBAC access will be implemented later."
                  data-wd-key="modal:open.azuremaps.subscription_key"
                  type="text"
                  default="Azure Maps subscription key..."
                  value={this.state.azMapsKey}
                  onInput={this.onChangeAzureMapsSubscriptionKey}
                  onChange={this.onChangeAzureMapsSubscriptionKey}
                />

                <p>
                  Select domain associated with your subscription key.
                </p>
                <InputSelect
                  aria-label="Azure Maps domain associated with the subscription."
                  data-wd-key="modal:open.azuremaps.domain" 
                  options={this.props.azureMapsExtension.domains.map(domain => [domain, domain])}
                  value={this.state.azMapsDomain}
                  onChange={this.onChangeAzureMapsDomain}
                />

                <InputButton
                  data-wd-key="modal:open.azuremaps.get_style_set_list.button"
                  type="submit"
                  className="maputnik-big-button"
                  disabled={this.state.azMapsKey.length < 1}
                >Get map configuration list</InputButton>
              </div>
            </form>

            {this.state.azMapsStyleSetName &&
              <form onSubmit={this.onSubmitAzureMapsStyleSet}>
                <div className="maputnik-style-gallery-container">
                  <p>
                    Select the map configuration:
                  </p>
                  <InputSelect
                    aria-label="Azure Maps map configuration list."
                    data-wd-key="modal:open.azuremaps.style_set_list" 
                    options={this.state.azMapsStyleSetList.map(styleSet => [styleSet.alias || styleSet.mapConfigurationId, styleSet.alias || styleSet.mapConfigurationId] )}
                    value={this.state.azMapsStyleSetName}
                    onChange={this.onChangeAzureMapsStyleSetName}
                  />

                  <InputButton
                    data-wd-key="modal:open.azuremaps.load_style_set.button"
                    type="submit"
                    className="maputnik-big-button"
                    disabled={!this.state.azMapsStyleSetName}
                  >Load map configuration</InputButton>
                </div>
              </form>
            }

            {this.state.azMapsResultingStyleName &&
              <form onSubmit={this.onSubmitAzureMapsStyle}>
                <div className="maputnik-style-gallery-container">
                  <p>
                    Select the style:
                  </p>
                  <InputSelect
                    aria-label="Azure Maps map configuration's style list."
                    data-wd-key="modal:open.azuremaps.style_set_style_list" 
                    options={this.state.azMapsStyleTuples.map(styleTuple => [styleTuple, styleTuple] )}
                    value={this.state.azMapsResultingStyleName}
                    onChange={this.onChangeAzureMapsResultingStyleName}
                  />

                  <InputButton
                    data-wd-key="modal:open.azuremaps.load_style_set_style.button"
                    type="submit"
                    className="maputnik-big-button"
                    disabled={!this.state.azMapsResultingStyleName}
                  >Load selected style</InputButton>
                </div>
              </form>
            }
          </section>
        </Modal>

        <ModalLoading
          isOpen={!!this.state.activeRequest}
          title={'Loading style'}
          onCancel={(e) => this.onCancelActiveRequest(e)}
          message={"Loading: "+this.state.activeRequestUrl}
        />
      </div>
    )
  }
}

