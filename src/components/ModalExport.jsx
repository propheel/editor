import React from 'react'
import PropTypes from 'prop-types'
import { saveAs } from 'file-saver'
import FieldString from './FieldString'
import InputButton from './InputButton'
import ModalLoading from './ModalLoading'
import Modal from './Modal'
import {MdFileDownload, MdCloudUpload} from 'react-icons/md'


export default class ModalExport extends React.Component {
  static propTypes = {
    mapStyle: PropTypes.object.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onOpenToggle: PropTypes.func.isRequired,
    azureMapsExtension: PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    this.state = {
      azMapsStyleAlias: this.props.azureMapsExtension.styleAlias,
      azMapsStyleDescription: this.props.azureMapsExtension.styleDescription,
      azMapsMapConfigurationAlias: this.props.azureMapsExtension.mapConfigurationAlias,
      azMapsMapConfigurationDescription: this.props.azureMapsExtension.mapConfigurationDescription,
      activeRequestMessage: ""
    }
  }

  onChangeAzureMapsStyleDescription = (styleDescription) => {
    this.props.azureMapsExtension.styleDescription = styleDescription;
    this.setState({
      azMapsStyleDescription: styleDescription
    });
  }

  onChangeAzureMapsStyleAlias = (styleAlias) => {
    this.props.azureMapsExtension.styleAlias = styleAlias;
    this.setState({
      azMapsStyleAlias: styleAlias
    });
  }

  onChangeAzureMapsMapConfigurationDescription = (mapConfigurationDescription) => {
    this.props.azureMapsExtension.mapConfigurationDescription = mapConfigurationDescription;
    this.setState({
      azMapsMapConfigurationDescription: mapConfigurationDescription
    });
  }

  onChangeAzureMapsMapConfigurationAlias = (mapConfigurationAlias) => {
    this.props.azureMapsExtension.mapConfigurationAlias = mapConfigurationAlias;
    this.setState({
      azMapsMapConfigurationAlias: mapConfigurationAlias
    });
  }

  downloadAzureMapsStyle() {
    this.props.azureMapsExtension.getUpdatedStyle(this.props.mapStyle)
    .then((zipBlob) => {
      saveAs(zipBlob, "azureMapsStyle.zip");
    })
  }

  uploadAzureMapsStyle() {
    this.props.azureMapsExtension.uploadResultingStyle(this.props.mapStyle)
    .then((styleId) => {
      this.setState({
        activeRequest: { abort: () => { } },
        activeRequestMessage: "Success! The uploaded style has the following ID: " + styleId
      });
    })
    .catch((err) => {
      this.setState({
        activeRequest: { abort: () => { } },
        activeRequestMessage: "Failed uploading the style"
      });
      console.error(err);
    })

    this.setState({
      activeRequest: { abort: () => { } },
      activeRequestMessage: "Uploading Azure Maps Style..."
    });
  }

  downloadAzureMapsMapConfiguration() {
    this.props.azureMapsExtension.getUpdatedMapConfiguration()
    .then((zipBlob) => {
      saveAs(zipBlob, "azureMapsMapConfiguration.zip");
    })
  }

  uploadAzureMapsMapConfiguration() {
    this.props.azureMapsExtension.uploadResultingMapConfiguration()
    .then((mapConfigurationId) => {
      this.setState({
        activeRequest: { abort: () => { } },
        activeRequestMessage: "Success! The uploaded map configuration has the following ID: " + mapConfigurationId
      });
    })
    .catch((err) => {
      this.setState({
        activeRequest: { abort: () => { } },
        activeRequestMessage: "Failed uploading the map configuration"
      });
      console.error(err);
    })

    this.setState({
      activeRequest: { abort: () => { } },
      activeRequestMessage: "Uploading Azure Maps Map Configuration..."
    });
  }

  onCancelActiveRequest(e) {
    if(e) e.stopPropagation();

    if(this.state.activeRequest) {
      this.state.activeRequest.abort();
      this.setState({
        activeRequest: null,
        activeRequestMessage: ""
      });
    }
  }

  render() {
    return (
      <div>
        <Modal
          data-wd-key="modal:export"
          isOpen={this.props.isOpen}
          onOpenToggle={this.props.onOpenToggle}
          title={'Export Style & Map Configuration'}
          className="maputnik-export-modal"
        >

          <section className="maputnik-modal-section">
            <h1>Azure Maps - Style</h1>

            <p>
              Download current style to your local machine.
            </p>

            <div className="maputnik-modal-export-buttons">
              <InputButton
                onClick={this.downloadAzureMapsStyle.bind(this)}
              >
                <MdFileDownload />
                Download Style
              </InputButton>
            </div>

            <p>
              Upload current style to your Creator's account.
            </p>

            <div>
              <FieldString
                label="Style description"
                fieldSpec={{doc:"Human-readable description of the uploaded style."}}
                value={this.props.azureMapsExtension.styleDescription}
                onChange={this.onChangeAzureMapsStyleDescription}
              />
              <FieldString
                label="Style alias"
                fieldSpec={{doc:`Alias of the uploaded style. Contains only alphanumeric characters (0-9, a-z, A-Z), hyphen (-) and underscore (_). Can be empty, so the resulting style can be referenced by the styleId only.
                
                WARNING! If the alias of an existing style is used the style will be overwritten. No map configurations will be updated.`}}
                value={this.props.azureMapsExtension.styleAlias}
                onChange={this.onChangeAzureMapsStyleAlias}
              />
            </div>

            <div className="maputnik-modal-export-buttons">
              <InputButton
                onClick={this.uploadAzureMapsStyle.bind(this)}
              >
                <MdCloudUpload />
                Upload Style
              </InputButton>
            </div>
          </section>

          <section className="maputnik-modal-section">
            <h1>Azure Maps - Map Configuration</h1>

            <p>
              Download current map configuration to your local machine.
            </p>

            <div className="maputnik-modal-export-buttons">
              <InputButton
                onClick={this.downloadAzureMapsMapConfiguration.bind(this)}
              >
                <MdFileDownload />
                Download Map Configuration
              </InputButton>
            </div>

            <p>
              Upload current map configuration to your Creator's account.
            </p>

            <div>
              <FieldString
                label="Map configuration description"
                fieldSpec={{doc:"Human-readable description of the uploaded map configuration."}}
                value={this.props.azureMapsExtension.mapConfigurationDescription}
                onChange={this.onChangeAzureMapsMapConfigurationDescription}
              />
              <FieldString
                label="Map configuration alias"
                fieldSpec={{doc:`Alias of the uploaded map configuration. Contains only alphanumeric characters (0-9, a-z, A-Z), hyphen (-) and underscore (_). Can be empty, so the resulting map configuration can be referenced by the mapConfigurationId only.
                
                WARNING! If the alias of an existing map configuration is used the map configuration will be overwritten.`}}
                value={this.props.azureMapsExtension.mapConfigurationAlias}
                onChange={this.onChangeAzureMapsMapConfigurationAlias}
              />
            </div>

            <div className="maputnik-modal-export-buttons">
              <InputButton
                onClick={this.uploadAzureMapsMapConfiguration.bind(this)}
              >
                <MdCloudUpload />
                Upload Map Configuration
              </InputButton>
            </div>
          </section>
        </Modal>

        <ModalLoading
          isOpen={!!this.state.activeRequest}
          title={'Uploading...'}
          onCancel={(e) => this.onCancelActiveRequest(e)}
          message={this.state.activeRequestMessage}
        />
      </div>
    )
  }
}

