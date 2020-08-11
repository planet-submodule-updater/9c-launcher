import React from "react";
import mixpanel from "mixpanel-browser";
import { ipcRenderer, IpcRendererEvent } from "electron";
import { observer, inject } from "mobx-react";
import { IStoreContainer } from "../../../interfaces/store";
import { Container, Typography, CircularProgress } from "@material-ui/core";
import { styled } from "@material-ui/core/styles";
import {
  useNodeStatusSubscriptionSubscription,
  usePreloadProgressSubscriptionSubscription,
  useValidateSnapshotLazyQuery,
} from "../../../generated/graphql";
import preloadProgressViewStyle from "./PreloadProgressView.style";
import { electronStore } from "../../../config";
import { RouterStore } from "mobx-react-router";

import useDidUpdateEffect from "../../hooks/useDidUpdateEffect";

enum PreloadProgressPhase {
  ActionExecutionState,
  BlockDownloadState,
  BlockHashDownloadState,
  BlockVerificationState,
  StateDownloadState,
}

const PreloadProgressView = observer((props: IStoreContainer) => {
  const { accountStore, routerStore, standaloneStore } = props;
  const classes = preloadProgressViewStyle();
  const {
    data: preloadProgressSubscriptionResult,
  } = usePreloadProgressSubscriptionSubscription();
  const {
    data: nodeStatusSubscriptionResult,
  } = useNodeStatusSubscriptionSubscription();
  const preloadProgress = preloadProgressSubscriptionResult?.preloadProgress;

  const [isPreloadEnded, setPreloadStats] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [step, setStep] = React.useState(0);

  const [
    validateSnapshot,
    { loading, data, error },
  ] = useValidateSnapshotLazyQuery();

  React.useEffect(() => {
    ipcRenderer.on("metadata downloaded", (_, meta) => {
      console.log("Metadata downloded. Verifying...");
      validateSnapshot({ variables: { raw: meta } });
      // returns true iff snapshot need to be downloaded
    });

    ipcRenderer.on(
      "download progress",
      (event: IpcRendererEvent, progress: IDownloadProgress) => {
        setStep(1);
        setProgress(progress.percent * 100);
      }
    );

    ipcRenderer.on("download complete", (_, path: string) => {
      // download completed...
    });

    ipcRenderer.on("extract progress", (event, progress) => {
      setStep(2);
      setProgress(progress * 100);
    });

    ipcRenderer.on("extract complete", (event) => {
      // snapshot extraction completed, but node service did not launched yet.
    });

    ipcRenderer.on("snapshot complete", (event) => {
      console.log("Snapshot extraction completed. Start IBD.");
      startPreloading();
    });

    // 여기서 스냅샷을 받을지 여부를 결정 가능
    if (electronStore.get("UseSnapshot")) {
      downloadSnapShot();
    } else {
      startPreloading();
    }
  }, []);

  React.useEffect(() => {
    if (undefined === error && !loading && data !== undefined) {
      if (data.validation.metadata) {
        const options: IDownloadOptions = {
          properties: {},
        };
        console.log("Snapshot is valid. Start downloading.");
        ipcRenderer.send("download snapshot", options);
      } else {
        console.log("Snapshot is invalid or redundent. Skip snapshot.");
        startPreloading();
      }
    }
  }, [data?.validation.metadata]);

  useDidUpdateEffect(() => {
    mixpanel.track(statusMessage[step]);
  }, [step]);

  const downloadSnapShot = () => {
    const options: IDownloadOptions = {
      properties: {},
    };
    ipcRenderer.send("download metadata", options);
  };

  const startPreloading = () => {
    mixpanel.track("Launcher/IBD Start");
    standaloneStore
      .runStandalone()
      .then(() => {
        if (accountStore.isLogin && accountStore.privateKey !== "") {
          return standaloneStore.setMining(
            !standaloneStore.NoMiner,
            accountStore.privateKey
          );
        }
      })
      .catch((error) => {
        console.log(error);
        routerStore.push("/error");
      });
  };

  React.useEffect(() => {
    const isEnded = nodeStatusSubscriptionResult?.nodeStatus?.preloadEnded;
    setPreloadStats(isEnded === undefined ? false : isEnded);
  }, [nodeStatusSubscriptionResult?.nodeStatus?.preloadEnded]);

  React.useEffect(() => {
    standaloneStore.IsPreloadEnded = isPreloadEnded;
  }, [isPreloadEnded]);

  React.useEffect(() => {
    const prog = getProgress(
      preloadProgressSubscriptionResult?.preloadProgress?.extra.currentCount,
      preloadProgressSubscriptionResult?.preloadProgress?.extra.totalCount
    );
    setProgress(prog);
  }, [preloadProgress?.extra]);

  React.useEffect(() => {
    if (isPreloadEnded) {
      const phase: PreloadProgressPhase =
        PreloadProgressPhase[preloadProgress?.extra.type];

      if (
        phase !== PreloadProgressPhase.ActionExecutionState &&
        phase !== PreloadProgressPhase.StateDownloadState &&
        electronStore.get("PeerStrings").length > 0
      ) {
        routerStore.push("/error");
      }
    }
  }, [isPreloadEnded, preloadProgress?.extra]);

  React.useEffect(() => {
    if (preloadProgress !== undefined) {
      setStep(preloadProgress?.currentPhase + 2);
    }
  }, [preloadProgress]);

  return (
    <Container className="footer">
      {isPreloadEnded ? (
        <Typography className={classes.text}>Preload Completed.</Typography>
      ) : (
        <>
          <CircularProgress className={classes.circularProgress} size={12} />
          <Typography className={classes.text}>
            {statusMessage[step]} ({step + 1}/8) {Math.floor(progress)}%
          </Typography>
        </>
      )}
    </Container>
  );
});

const statusMessage = [
  "Validating Snapshot...",
  "Downloading Snapshot...",
  "Extracting Snapshot...",
  "Verifying block headers...",
  "Downloading block hashes...",
  "Extracting Snapshot...",
  "Verifying block headers...",
  "Downloading block hashes...",
  "Downloading blocks...",
  "Downloading states...",
  "Executing actions...",
];

const getProgress = (
  current: number | undefined,
  total: number | undefined
) => {
  if (current === undefined) return 0;
  if (total === undefined) return 0;
  return total === 0 ? 0 : Math.round((current / total) * 100);
};

export default inject(
  "accountStore",
  "routerStore",
  "standaloneStore"
)(PreloadProgressView);
