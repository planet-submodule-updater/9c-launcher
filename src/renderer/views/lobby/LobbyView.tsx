import React, {
  useState,
  useEffect,
  useCallback,
  ChangeEvent,
  FormEvent,
} from "react";
import {
  Button as ButtonOrigin,
  ButtonProps,
  CircularProgress,
  Container,
  FormHelperText,
  LinearProgress,
  TextField,
} from "@material-ui/core";

import { IStoreContainer } from "../../../interfaces/store";
import { inject, observer } from "mobx-react";
import {
  useActivateMutation,
  useActivationLazyQuery,
} from "../../../generated/graphql";
import lobbyViewStyle from "./LobbyView.style";

import { useLocale } from "../../i18n";
import { Lobby } from "../../../interfaces/i18n";
import { sleep } from "../../../utils";
import { ipcRenderer } from "electron";

interface ILobbyViewProps extends IStoreContainer {
  onLaunch: () => void;
}

const Button = (
  props: Omit<ButtonProps, "fullWidth" | "variant" | "color">
) => <ButtonOrigin fullWidth variant="contained" color="primary" {...props} />;

const LobbyView = observer((props: ILobbyViewProps) => {
  const classes = lobbyViewStyle();
  const { accountStore, gameStore, standaloneStore } = props;
  const [
    activation,
    { loading, error: statusError, data: status, refetch: activationRefetch },
  ] = useActivationLazyQuery();
  const [
    activate,
    { data: isActivated, error: activatedError },
  ] = useActivateMutation();
  const [activationKey, setActivationKey] = useState("");
  const [polling, setPollingState] = useState(false);

  const { locale } = useLocale<Lobby>("lobby");

  const handleActivateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPollingState(true);

    const activated = async () => {
      const result = await activationRefetch();
      return result.data.activationStatus.activated;
    };

    if (await activated()) {
      setPollingState(false);
      return;
    }

    const activateResult = await activate({
      variables: {
        encodedActivationKey: activationKey,
      },
    });

    if (!activateResult.data?.activationStatus?.activateAccount) {
      setPollingState(false);
      return;
    }

    while (true) {
      await sleep(1000);
      if (await activated()) {
        setPollingState(false);
        return;
      }
    }
  };

  const privateKeyChangeHandle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setActivationKey(event.target.value);
    },
    [event]
  );

  useEffect(() => {
    if (standaloneStore.Ready && standaloneStore.IsSetPrivateKeyEnded) {
      activation();
    }
  }, [standaloneStore.Ready, standaloneStore.IsSetPrivateKeyEnded]);

  let child: JSX.Element;
  if (loading || polling) {
    child = (
      <>
        <p className={classes.verifing}>{locale("확인 중...")}</p>
        <CircularProgress />
      </>
    );
  } else if (!standaloneStore.Ready) {
    child = <PreloadWaitingButton />;
  } else if (status?.activationStatus.activated) {
    child = <GameStartButton {...props} />;
  } else {
    child = (
      <form onSubmit={handleActivateSubmit}>
        <TextField
          error={activatedError?.message !== undefined}
          label={locale("초대 코드")}
          onChange={privateKeyChangeHandle}
          fullWidth
        />
        {activatedError?.message !== undefined && (
          <FormHelperText>
            {/* FIXME 예외 타입으로 구분해서 메시지 국제화 할 것 */}
            {activatedError?.message
              ?.split("\n")
              ?.shift()
              ?.split(":")
              ?.pop()
              ?.trim()}
          </FormHelperText>
        )}
        <ButtonOrigin
          color="primary"
          variant="contained"
          className={classes.activation}
          type="submit"
        >
          {locale("활성화")}
        </ButtonOrigin>
      </form>
    );
  }
  return <Container>{child}</Container>;
});

const PreloadWaitingButton = () => {
  const { locale } = useLocale<Lobby>("lobby");
  return (
    <Button disabled={true} className={lobbyViewStyle().gameStartButton}>
      {locale("프리로딩 중...")}
    </Button>
  );
};

const GameStartButton = observer((props: ILobbyViewProps) => {
  const { accountStore, gameStore, standaloneStore } = props;
  const classes = lobbyViewStyle();
  const handleStartGame = () => {
    ipcRenderer.send("mixpanel-track-event", "Launcher/Unity Player Start");
    gameStore.startGame(accountStore.privateKey);
    props.onLaunch();
  };

  const { locale } = useLocale<Lobby>("lobby");

  useEffect(() => {
    if (standaloneStore.Ready) {
      handleStartGame();
    }
  }, [standaloneStore.Ready]);

  return (
    <Button
      disabled={gameStore.isGameStarted}
      onClick={handleStartGame}
      className={classes.gameStartButton}
      id="start-game"
    >
      {gameStore.isGameStarted
        ? `${locale("실행 중...")}`
        : `${locale("게임 시작하기")}`}
    </Button>
  );
});

export default inject(
  "accountStore",
  "gameStore",
  "standaloneStore"
)(LobbyView);
