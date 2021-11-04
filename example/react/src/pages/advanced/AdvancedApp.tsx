import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonToggle,
  IonFooter,
} from '@ionic/react';

import React from "react";
import { trash, navigate, home, play, pause } from "ionicons/icons";
import { Storage } from '@capacitor/storage';
import { useHistory } from 'react-router-dom';

import BackgroundGeolocation, {
  Location,
  MotionActivityEvent,
  Subscription
} from "@transistorsoft/capacitor-background-geolocation";

import {ENV} from "../../config/ENV";
import SettingsService from "./lib/SettingsService";

import './styles.css';
import MapView from "./MapView";
import FABMenu from "./FABMenu";

/// Collection of BackgroundGeolocation event Subscription instances.
/// We collect these so we can remove event-listeners when the View is removed or refreshed
/// during development live-reload.  Otherwise a new event-listener would be registered
/// with each refresh.
///
const SUBSCRIPTIONS:Subscription[] = [];

const subscribe = (subscription:Subscription) => {
  SUBSCRIPTIONS.push(subscription);
}

const unsubscribe = () => {
  SUBSCRIPTIONS.forEach((subscription) => subscription.remove() )
  SUBSCRIPTIONS.splice(0, SUBSCRIPTIONS.length);
}

const AdvancedApp: React.FC = () => {
  const history = useHistory();
  const settingsService = SettingsService.getInstance();

  const [enabled, setEnabled] = React.useState(false);
  const [isMoving, setIsMoving] = React.useState(false);
  const [location, setLocation] = React.useState<Location|null>(null);
  const [odometer, setOdometer] = React.useState(0);
  const [motionActivityEvent, setMotionActivityEvent] = React.useState<MotionActivityEvent|null>(null);
  const [testClicks, setTestClicks] = React.useState(0);
  const [clickBufferTimeout, setClickBufferTimeout] = React.useState<any>(0);

  React.useEffect(() => {
    initBackgroundGeolocation();
    return () => {
      unsubscribe();
    }
  }, []);

  /// Location effect-handler
  React.useEffect(() => {
    if (!location) return;
    setOdometer(location.odometer);
  }, [location]);

  const initBackgroundGeolocation = async () => {
    subscribe(BackgroundGeolocation.onLocation(setLocation, (error) => {
      console.log('[onLocation] ERROR: ', error);
    }));
    subscribe(BackgroundGeolocation.onMotionChange((location) => {
      setIsMoving(location.isMoving);
    }));

    subscribe(BackgroundGeolocation.onActivityChange(setMotionActivityEvent));

    // Fetch registered orgname / username from Storage so we can fetch an Auth token from the demo server
    const org = (await Storage.get({key: 'orgname'})).value;
    const username = (await Storage.get({key: 'username'})).value;
    if ((org === null) || (username === null)) {
      history.goBack();
      return;
    }

    // Get an authorization token from demo server at tracker.transistorsoft.com
    const token = await BackgroundGeolocation.findOrCreateTransistorAuthorizationToken(org, username, ENV.TRACKER_HOST);

    BackgroundGeolocation.ready({
      // Debugging.
      reset: true,
      debug: true,
      logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
      transistorAuthorizationToken: token,
      // Geolocation
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
      distanceFilter: 10,
      stopTimeout: 5,
      // Permissions
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: "Allow {applicationName} to access this device's location even when closed or not in use.",
        message: "This app collects location data to enable recording your trips to work and calculate distance-travelled.",
        positiveAction: 'Change to "{backgroundPermissionOptionLabel}"',
        negativeAction: 'Cancel'
      },
      // HTTP & Persistence
      autoSync: true,
      maxDaysToPersist: 14,
      // Application
      stopOnTerminate: false,
      startOnBoot: true
    }).then((state) => {
      setEnabled(state.enabled);
      setIsMoving(state.isMoving!);
      setOdometer(state.odometer);
    });
  }

  /// Handles test-mode clicks on bottom toolbar, ie: [activity:123km]
  /// Reloads test-config.
  React.useEffect(() => {
    // Swallow the zero event.
    if (testClicks === 0) return;

    console.log('[TEST CLICK]:', testClicks);
    settingsService.playSound('TEST_MODE_CLICK');
    if (testClicks >= 10) {
      // Hit it!
      setTestClicks(0);
      settingsService.playSound('TEST_MODE_SUCCESS');
      settingsService.applyTestConfig();
    } else if (testClicks <= 10) {
      // Keep going...
      if (clickBufferTimeout > 0) {
        clearTimeout(clickBufferTimeout);
      }
      setClickBufferTimeout(setTimeout(() => {
        setTestClicks(0);
      }, 2000));
    }
  }, [testClicks]);

  /// [Home] button handler
  const onClickHome = () => {
    history.goBack();
  }

  /// Enabled Switch handler.
  const onToggleEnabled = (value:boolean) => {
    if (value === undefined) { return; }
    if (value) {
      BackgroundGeolocation.start();
    } else {
      BackgroundGeolocation.stop();
    }
    setEnabled(value);
    if (!value) {
      setIsMoving(false);
    }
  }

  /// Get Current Position button handler.
  const onClickGetCurrentPosition = () => {
    settingsService.playSound('BUTTON_CLICK');

    BackgroundGeolocation.getCurrentPosition({
      extras: {
        getCurrentPosition: true
      }
    }).then((location) => {
      console.log('[getCurrentPosition]', location);
    }).catch((error) => {
      console.warn('[getCurrentPosition] ERROR', error);
    });
  }

  /// [play] / [pause] button handler.
  const onClickChangePace = () => {
    if (!enabled) { return; }
    setIsMoving(!isMoving);
    BackgroundGeolocation.changePace(!isMoving);
  }

  return (
    <IonPage className="AdvancedApp">
      <IonHeader>
        <IonToolbar color="tertiary">
          <IonTitle color="dark">BG Geolocation</IonTitle>
          <IonButtons slot="start">
            <IonButton onClick={onClickHome}><IonIcon icon={home} /></IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonToggle checked={enabled} onIonChange={e => onToggleEnabled(e.detail.checked)}/>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <MapView />
        <FABMenu />
      </IonContent>
      <IonFooter>
        <IonToolbar color="tertiary">
          <IonButtons slot="start">
            <IonButton onClick={onClickGetCurrentPosition}><IonIcon icon={navigate} /></IonButton>
          </IonButtons>
          <IonTitle style={{textAlign:'center'}}>
            <IonButton fill="clear" color="dark" onClick={() => setTestClicks(testClicks+1)}>{(motionActivityEvent) ? motionActivityEvent.activity : 'Unknown'}&nbsp;•&nbsp;{(odometer/1000).toFixed(1)}km</IonButton>
          </IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClickChangePace} disabled={!enabled} fill="solid" color={(isMoving) ? "danger" : "success"} style={{width:50}}><IonIcon icon={(isMoving) ? pause : play} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  );
};

export default AdvancedApp;