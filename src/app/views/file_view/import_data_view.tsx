// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as React from "react";
import * as R from "../../resources";
import * as globals from "../../globals";
import { getConfig } from "../../config";
import {
  Dataset,
  deepClone,
  ImageKeyColumn,
  KeyColumn,
  LinkSourceKeyColumn,
  LinkTargetKeyColumn,
} from "../../../core";
import {
  classNames,
  getExtensionFromFileName,
  getFileNameWithoutExtension,
  readFileAsString,
} from "../../utils";
import { ButtonRaised } from "../../components/index";
import { SVGImageIcon } from "../../components/icons";
import { TableView } from "../dataset/table_view";
import { PopupView } from "../../controllers";
import { TableType } from "../../../core/dataset";
import { AppStore } from "../../stores";
import { AddMessage, RemoveMessage } from "../../actions/actions";
import { strings } from "../../../strings";
import { Button } from "@fluentui/react-button";
import { CheckRegular } from "@fluentui/react-icons";

export interface FileUploaderProps {
  onChange: (file: File) => void;
  extensions: string[];
  filename?: string;
}

export interface FileUploaderState {
  filename: string;
  draggingOver: boolean;
}

export class FileUploader extends React.Component<
  React.PropsWithChildren<FileUploaderProps>,
  FileUploaderState
> {
  private inputElement: HTMLInputElement;

  constructor(props: FileUploaderProps) {
    super(props);
    this.state = {
      draggingOver: false,
      filename: props.filename,
    };
  }

  public reset() {
    this.inputElement.value = null;
    this.setState({
      filename: null,
    });
  }

  private onInputChange() {
    if (this.inputElement.files.length == 1) {
      this.setState({
        filename: this.inputElement.files[0].name,
      });
      if (this.props.onChange) {
        this.props.onChange(this.inputElement.files[0]);
      }
    }
  }

  private showOpenFile() {
    this.reset();
    this.inputElement.click();
  }

  private isDataTransferValid(dt: DataTransfer) {
    if (dt && dt.items.length == 1) {
      if (dt.items[0].kind == "file") {
        return true;
      }
    }
    return false;
  }
  private getFileFromDataTransfer(dt: DataTransfer) {
    if (dt && dt.items.length == 1) {
      if (dt.items[0].kind == "file") {
        const file = dt.items[0].getAsFile();
        const ext = getExtensionFromFileName(file.name);
        if (this.props.extensions.indexOf(ext) >= 0) {
          return file;
        } else {
          return null;
        }
      }
    }
    if (dt && dt.files.length == 1) {
      return dt.files[0];
    }
    return null;
  }

  public render() {
    return (
      <div
        tabIndex={0}
        className={classNames(
          "charticulator__file-uploader",
          ["is-dragging-over", this.state.draggingOver],
          ["is-active", this.state.filename != null]
        )}
        onClick={() => this.showOpenFile()}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            this.showOpenFile();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (this.isDataTransferValid(e.dataTransfer)) {
            this.setState({
              draggingOver: true,
            });
          }
        }}
        onDragLeave={() => {
          this.setState({
            draggingOver: false,
          });
        }}
        onDragExit={() => {
          this.setState({
            draggingOver: false,
          });
        }}
        onDrop={(e) => {
          e.preventDefault();
          this.setState({
            draggingOver: false,
          });
          const file = this.getFileFromDataTransfer(e.dataTransfer);
          if (file != null) {
            this.setState({
              filename: file.name,
            });
            if (this.props.onChange) {
              this.props.onChange(file);
            }
          }
        }}
      >
        <input
          style={{ display: "none" }}
          accept={this.props.extensions.map((x) => "." + x).join(",")}
          ref={(e) => (this.inputElement = e)}
          type="file"
          onChange={() => this.onInputChange()}
        />
        {this.state.filename == null ? (
          <span className="charticulator__file-uploader-prompt">
            <SVGImageIcon url={R.getSVGIcon("toolbar/import")} />
            {strings.fileImport.fileUpload}
          </span>
        ) : (
          <span className="charticulator__file-uploader-filename">
            {this.state.filename}
          </span>
        )}
      </div>
    );
  }
}

export interface ImportDataViewProps {
  onConfirmImport?: (dataset: Dataset.Dataset) => void;
  onCancel?: () => void;
  showCancel?: boolean;
  store: AppStore;
}

export interface ImportDataViewState {
  dataTable: Dataset.Table;
  dataTableOrigin: Dataset.Table;
  imagesTable: Dataset.Table;
  linkTable: Dataset.Table;
  linkTableOrigin: Dataset.Table;
}

export class ImportDataView extends React.Component<
  React.PropsWithChildren<ImportDataViewProps>,
  ImportDataViewState
> {
  public state = {
    dataTable: null as Dataset.Table,
    imagesTable: null as Dataset.Table,
    linkTable: null as Dataset.Table,
    dataTableOrigin: null as Dataset.Table,
    linkTableOrigin: null as Dataset.Table,
  };
  private isComponentMounted: boolean;

  constructor(props: ImportDataViewProps) {
    super(props);
    this.props.store.addListener(AppStore.EVENT_GRAPHICS, () => {
      if (this.isComponentMounted) {
        this.forceUpdate();
      }
    });
  }

  componentDidMount() {
    this.isComponentMounted = true;
  }

  componentWillUnmount() {
    this.isComponentMounted = false;
  }

  private loadFileAsTable(
    file: File
  ): Promise<[Dataset.Table, Dataset.Table | null]> {
    return readFileAsString(file).then((contents) => {
      const localeFileFormat = this.props.store.getLocaleFileFormat();
      const ext = getExtensionFromFileName(file.name);
      const filename = getFileNameWithoutExtension(file.name);
      const loader = new Dataset.DatasetLoader();
      switch (ext) {
        case "csv": {
          const table = loader.loadDSVFromContents(
            filename,
            contents,
            localeFileFormat
          );
          // if table contains images split to separate table
          const keyAndImageColumns = table.columns.filter(
            (column) =>
              column.name === ImageKeyColumn ||
              column.type === Dataset.DataType.Image
          );
          if (keyAndImageColumns.length === 2) {
            const imagesIds = table.rows.map((row) => row?.[ImageKeyColumn]);
            const uniqueIds = [...new Set(imagesIds)];

            const rows = uniqueIds.map((imageId) => {
              return table.rows.find((row) => row[ImageKeyColumn] === imageId);
            });
            const imageTable: Dataset.Table = {
              ...table,
              name: table.name + "Images",
              displayName: table.displayName + "Images",
              columns: keyAndImageColumns,
              rows: rows.map((row) => {
                const imageRow: Dataset.Row = {
                  _id: row["_id"],
                };
                keyAndImageColumns.forEach((column) => {
                  imageRow[column.name] = row[column.name];
                });
                return imageRow;
              }),
            };

            table.columns = table.columns.filter(
              (column) =>
                column.type !== Dataset.DataType.Image &&
                column.displayName !== ImageKeyColumn
            );

            return [table, imageTable];
          }
          return [table, null];
        }
        case "tsv": {
          return [
            loader.loadDSVFromContents(filename, contents, {
              delimiter: "\t",
              numberFormat: localeFileFormat.numberFormat,
              currency: null,
              group: null,
              utcTimeZone: true,
              billionsFormat: localeFileFormat?.billionsFormat || "giga",
            }),
            null,
          ];
        }
        case "json": {
          return [
            loader.loadDSVFromContents(filename, contents, {
              numberFormat: localeFileFormat.numberFormat,
              currency: null,
              group: null,
              utcTimeZone: true,
              billionsFormat: localeFileFormat?.billionsFormat || "giga",
            }),
            null,
          ];
        }
      }
    });
  }

  public renderTable(
    table: Dataset.Table,
    onChange: (changes) => void,
  ) {
    return (
      <div className="wide-content">
        <TableView onChange={onChange} table={table} maxRows={5} />
      </div>
    );
  }

  private createEmptyMainTable() {
    this.setState({
      dataTable: {
        columns: [{
          displayName: "sample column",
          name: "sample column",
          metadata: {
            kind: Dataset.DataKind.Categorical
          },
          type: Dataset.DataType.String
        }],
        rows: [{
          _id: "0",
          "sample column": "sample value"
        }],
        name: "main",
        displayName: "Main",
        type: TableType.Main
      }
    });
    this.checkSourceAndTargetColumns(null);
    this.checkKeyColumn(this.state.dataTable, null);
  }

  private createEmptyLinksTable() {
    this.setState({
      linkTable: {
        columns: [{
          displayName: "source_id",
          name: "source_id",
          metadata: {
            kind: Dataset.DataKind.Categorical
          },
          type: Dataset.DataType.String
        },{
          displayName: "target_id",
          name: "target_id",
          metadata: {
            kind: Dataset.DataKind.Categorical
          },
          type: Dataset.DataType.String
        }],
        rows: [],
        name: "links",
        displayName: "Links",
        type: TableType.Main
      }
    });
  }

  // eslint-disable-next-line
  public render() {
    let sampleDatasetDiv: HTMLDivElement;
    const sampleDatasets = getConfig().SampleDatasets;
    return (
      <div className="charticulator__import-data-view">
        {sampleDatasets != null ? (
          <div ref={(e) => (sampleDatasetDiv = e)}>
            <ButtonRaised
              text={strings.fileImport.loadSample}
              onClick={() => {
                globals.popupController.popupAt(
                  (context) => {
                    return (
                      <PopupView context={context}>
                        <div className="charticulator__sample-dataset-list">
                          {sampleDatasets.map((dataset) => {
                            return (
                              <div
                                className="charticulator__sample-dataset-list-item"
                                key={dataset.name}
                                onClick={() => {
                                  Promise.all(
                                    dataset.tables.map((table, index) => {
                                      const loader = new Dataset.DatasetLoader();
                                      return loader
                                        .loadDSVFromURL(
                                          table.url,
                                          this.props.store.getLocaleFileFormat()
                                        )
                                        .then((r) => {
                                          r.name = table.name;
                                          r.displayName = table.name;
                                          r.type =
                                            index == 0
                                              ? TableType.Main
                                              : TableType.Links; // assumes there are two tables only
                                          return r;
                                        });
                                    })
                                  ).then((tables) => {
                                    context.close();
                                    const ds: Dataset.Dataset = {
                                      name: dataset.name,
                                      tables,
                                    };
                                    this.props.onConfirmImport(ds);
                                  });
                                }}
                              >
                                <div className="el-title">{dataset.name}</div>
                                <div className="el-description">
                                  {dataset.description}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </PopupView>
                    );
                  },
                  { anchor: sampleDatasetDiv }
                );
              }}
            />
          </div>
        ) : null}
        <h2>
          Data
          {this.state.dataTable ? ": " + this.state.dataTable.name : null}
        </h2>
        {this.state.dataTable ? (
          <>
            <Button
              icon={<SVGImageIcon url={R.getSVGIcon("ChromeClose")} />}
              onClick={() => {
                this.setState({
                  dataTable: null,
                  dataTableOrigin: null,
                });
              }}
            >
              {strings.fileImport.removeButtonText}
            </Button>
            <div className="charticulator__scrollable-table">
              {this.renderTable(
                this.state.dataTable,
                (table: Dataset.Table) => {
                  this.setState({
                    dataTable: table
                  })
                }
              )}
            </div>
            {this.state.imagesTable ? (
              <div className="charticulator__scrollable-table">
                {this.renderTable(
                  this.state.imagesTable,
                  (table: Dataset.Table) => {
                    this.setState({
                      imagesTable: table
                    })
                  },
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="charticulator__file-uploader-wrap">
              <div
                className="charticulator__file-uploader"
                onClick={() => this.createEmptyMainTable()}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    this.createEmptyMainTable();
                  }
                }}
              >
                <span className="charticulator__file-uploader-prompt">
                  <SVGImageIcon url={R.getSVGIcon("general/plus")} />
                  {strings.fileImport.new}
                </span>
              </div>
              <FileUploader
                extensions={["csv", "tsv", "json"]}
                onChange={(file) => {
                  this.loadFileAsTable(file).then(([table, imageTable]) => {
                    table.type = TableType.Main;
                    if (imageTable) {
                      imageTable.type = TableType.Image;
                    }

                    this.checkKeyColumn(table, this.state.linkTable);

                    this.setState({
                      dataTable: table,
                      dataTableOrigin: deepClone(table),
                      imagesTable: imageTable,
                    });
                  });
                }}
              />
            </div>
          </>
        )}
        <h2>
          {strings.fileImport.links}
          {this.state.linkTable ? ": " + this.state.linkTable.name : null}
        </h2>
        {this.state.linkTable ? (
          <>
            <Button
              icon={<SVGImageIcon url={R.getSVGIcon("ChromeClose")} />}
              title={strings.fileImport.removeButtonTitle}
              onClick={() => {
                this.setState({
                  linkTable: null,
                  linkTableOrigin: null,
                });
                this.checkSourceAndTargetColumns(null);
                this.checkKeyColumn(this.state.dataTable, null);
              }}
            >
              {strings.fileImport.removeButtonText}
            </Button>
            <div className="charticulator__scrollable-table">
              {this.renderTable(
                this.state.linkTable,
                (table: Dataset.Table) => {
                  this.setState({
                    linkTable: table
                  })
                }
              )}
            </div>
          </>
        ) : (
          <>
            <div className="charticulator__file-uploader-wrap">
              <div
                className="charticulator__file-uploader"
                onClick={() => this.createEmptyLinksTable()}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    this.createEmptyLinksTable();
                  }
                }}
              >
                <span className="charticulator__file-uploader-prompt">
                  <SVGImageIcon url={R.getSVGIcon("general/plus")} />
                  {strings.fileImport.new}
                </span>
              </div>
              <FileUploader
                extensions={["csv", "tsv", "json"]}
                onChange={(file) => {
                  this.loadFileAsTable(file).then(([table]) => {
                    table.type = TableType.Links;
                    this.checkSourceAndTargetColumns(table);
                    this.checkKeyColumn(this.state.dataTable, table);
                    this.setState({
                      linkTable: table,
                      linkTableOrigin: deepClone(table),
                    });
                  });
                }}
              />
            </div>
          </>
        )}
        <div className="el-actions">
          <Button
            icon={<CheckRegular />}
            title={strings.fileImport.doneButtonTitle}
            disabled={
              this.state.dataTable == null ||
              this.props.store.messageState.get("noID") !== undefined ||
              this.props.store.messageState.get("noSourceOrTargetID") !==
              undefined
            }
            onClick={() => {
              if (
                this.state.dataTable != null &&
                this.props.store.messageState.get("noID") === undefined &&
                this.props.store.messageState.get("noSourceOrTargetID") ===
                undefined
              ) {
                const dataset: Dataset.Dataset = {
                  name: this.state.dataTable.name,
                  tables: [this.state.dataTable, this.state.imagesTable].filter(
                    (table) => table != null
                  ),
                };
                if (this.state.linkTable != null) {
                  dataset.tables.push(this.state.linkTable);
                }
                this.props.onConfirmImport(dataset);
              }
            }}
          >
            {strings.fileImport.doneButtonText}
          </Button>
        </div>
        <div className="charticulator__credits">
          <p
            dangerouslySetInnerHTML={{
              __html:
                getConfig().LegalNotices &&
                getConfig().LegalNotices.privacyStatementHTML,
            }}
          />
        </div>
      </div>
    );
  }

  private checkSourceAndTargetColumns(table: Dataset.Table) {
    const countOfKeyColumns =
      table &&
      table.columns.filter(
        (column) =>
          column.name === LinkSourceKeyColumn ||
          column.name === LinkTargetKeyColumn
      ).length;
    if (table && countOfKeyColumns < 2) {
      this.props.store.dispatcher.dispatch(
        new AddMessage("noSourceOrTargetID", {
          text: strings.fileImport.messageNoSourceOrTargetID(
            LinkSourceKeyColumn,
            LinkTargetKeyColumn
          ),
        })
      );
    } else {
      this.props.store.dispatcher.dispatch(
        new RemoveMessage("noSourceOrTargetID")
      );
    }
  }

  private checkKeyColumn(mainTable: Dataset.Table, linksTable: Dataset.Table) {
    const isKeyColumn =
      mainTable &&
      mainTable.columns.find((column) => column.name === KeyColumn);
    if (!isKeyColumn && linksTable) {
      this.props.store.dispatcher.dispatch(
        new AddMessage("noID", {
          text: strings.fileImport.messageNoID(KeyColumn),
        })
      );
    } else {
      this.props.store.dispatcher.dispatch(new RemoveMessage("noID"));
    }
  }
}
