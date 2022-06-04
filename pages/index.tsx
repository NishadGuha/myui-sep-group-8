import React, { useState } from "react";
import { useQuery } from "react-query";
import { useSession } from "next-auth/react";
import { Layout } from "antd";
import "antd/dist/antd.css";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { i18n, useTranslation } from "next-i18next";
import { useRouter } from 'next/router'
import jwtDecode from "jwt-decode";

import AppHeader from "../components/AppHeader";
import { dashboardAddKey, dashboardRemoveKey } from "../components/NavigationSider";
import EditElementModal from "../components/EditElementModal";
import EditModeSider from "../components/EditModeSider";
import Loader from "../components/Loader";
import ManageDashboardsModal, { modalTypes } from "../components/ManageDashboardsModal";
import NavigationSider from "../components/NavigationSider";
import QueryInput from "../components/QueryInput";
import Workspace from "../components/Workspace";

const { Content, Sider } = Layout;

export enum sideBarItemTypes { BASE_TABLE, DASHBOARD }

export enum workspaceStates {
  EMPTY,
  BASE_TABLE,
  DISPLAY_DASHBOARD,
  EDIT_DASHBOARD
}

export enum elementType {
  GRIDVIEW,
  STATIC
}

/**
 * @param {*} { hasuraProps, systemProps }
 * @return {*} 
 */
export default function App({ hasuraProps, systemProps }: any) {
  const { t } = useTranslation();
  const [manageDashboardsModalState, setManageDashboardsModalState] = useState({ visible: false, type: modalTypes.ADD });
  const [editElementModalState, setEditElementModalState] = useState({ visible: false, element: {} });
  const router = useRouter();
  const { pathname, asPath, query } = router;

  // Define state variables for the user configuration
  const [userConfig, setUserConfig] = useState();

  // Define state variables that, once set, update the user configuration file
  const [userConfigQueryInput, setUserConfigQueryInput] = useState();

  const [dashboardNames, setDashboardNames] = useState<string[]>([]);

  const showModal = (type: modalTypes) => {
    setManageDashboardsModalState({ visible: true, type: type });
  };

  enum siderMenuState {
    READY,
    LOADING,
  }

  const [siderState, setSiderState] = useState({
    tableNames: [],
    tableNamesState: siderMenuState.LOADING,
  });

  const [workspaceState, setWorkspaceState] = useState({
    displaying: workspaceStates.EMPTY,
    name: "none",
  });

  const [dashboardState, setDashboardState] = useState({dashboard: {}});

  // Define the default UI configuration
  const defaultConfiguration = {
    "dashboards": [],
    "uiPreferences": {
      "language": "en"
    },
    "baseTables": []
  }

  // Fetching session token from the current session
  const { data: session } = useSession();
  const jwt = session!.token;

  const hasuraHeaders = {
    "Content-Type": "application/json",
    "x-hasura-admin-secret": hasuraProps.hasuraSecret,
  } as HeadersInit;

  interface JWTHasura {
    sub: number,
    name: string,
    admin: boolean,
    iat: string,
    "https://hasura.io/jwt/claims": {
      "x-hasura-allowed-roles": Array<string>,
      "x-hasura-default-role": string,
    },
  };

  // @ts-ignore
  const jwtTokenDecoded = jwtDecode<JWTHasura>(jwt);

  // Get ID from currently logged in user
  // let userId = jwtTokenDecoded.sub;
  let userId = 1; // @TODO

  // Get the configuration file of the currently loggged in user
  const { isSuccess: isSuccessConfig, data: configuration } = useQuery(["configurationQuery", userId], async () => {
    let result = await fetch(hasuraProps.hasuraEndpoint as RequestInfo, {
      method: "POST",
      headers: hasuraHeaders,
      body: JSON.stringify({
        query: `query getConfigurationFromUser { user_versioned_config(where: {user_id: {_eq: ${userId}}}, order_by: {date: desc}, limit: 1) { config }}`,
      }),
    })
      .then((userConfig) => userConfig.json())
      .then((userConfig) => {
        if (userConfig.data.user_versioned_config.length == 0) {
          // Set the default empty user's configuration
          userConfig = defaultConfiguration;
          setUserConfigQueryInput(userConfig); 
        } else {
          // Get the user's configuration        
          userConfig = userConfig.data.user_versioned_config[0].config;
          // Undo escaping of double quotes
          userConfig = JSON.parse(userConfig.replace('\"', '"'));
        }
        // Get the dashboard names to display on the sidebar
        const dashboards = userConfig.dashboards;
        let dashboardNames = dashboards.map((dashboard: any) => dashboard.name);
        setDashboardNames(dashboardNames);
        setUserConfig(userConfig); 

        // Push the language locale - needed to retrieve the correct language on startup
        router.push({ pathname, query }, asPath, { locale: userConfig.uiPreferences.language })
      });

    return result;
  });

  // Update the user configuration versioning table on modifications
  useQuery(["updateUserConfiguration", userId, userConfigQueryInput], async () => {
    if (userConfigQueryInput != undefined) {
      console.log('User configuration file is updated...');
      // Escape double quotes
      let newUserConfig = JSON.stringify(userConfigQueryInput).replace(/"/g, "\\\"");

      let result = await fetch(hasuraProps.hasuraEndpoint as RequestInfo, {
        method: "POST",
        headers: hasuraHeaders,
        body: JSON.stringify({
          query: `mutation insertUserConfig { insert_user_versioned_config_one(object: {config: "${newUserConfig}", user_id: ${userId}}) { config }}`,
        }),
      })
      // Clear the query input state variable
      setUserConfigQueryInput(undefined);
    }
  });

  // Get the all base tables from hasura
  const { isSuccess: isSuccessTable, data: tableNames }: any = useQuery(
    "tableQuery",
    () =>
      fetch(hasuraProps.hasuraEndpoint as RequestInfo, {
        method: "POST",
        headers: hasuraHeaders,
        body: JSON.stringify({
          query: `query LearnAboutSchema { __schema { queryType { fields { name }}}}`,
        }),
      })
        .then((res) => res.json())
        .then((res) => {
          const data = res.data.__schema.queryType.fields;
          let instances = data.map((instance: any) => instance.name);
          // For every table hasura has query types for aggregate functions and functions on the primary key.
          // We are not intrested in those tables, only the base table, so we filter them.
          instances = instances.filter((name: string) => {
            return !name.endsWith("_aggregate") && !name.endsWith("_by_pk");
          });
          setSiderState({
            tableNames: instances,
            tableNamesState: siderMenuState.READY,
          });
          return instances;
        })
  );

  /**
   * Display a base table in the workspace
   *
   * @param {string} name
   */
  const displayBaseTable = (name: string) => {
    setWorkspaceState({ displaying: workspaceStates.BASE_TABLE, name: name });
  };

  /**
   * Display a dashboard in the workspace
   *
   * @param {string} name
   * @param {*} userConfig
   */
  const displayDashboard = (name: string, userConfig: any) => {
    if (name == dashboardAddKey) {
      showModal(modalTypes.ADD);
    } else if (name == dashboardRemoveKey) {
      showModal(modalTypes.REMOVE);
    } else {
      setWorkspaceState({ displaying: workspaceStates.DISPLAY_DASHBOARD, name: name });
      // Get clicked dashboard configuration
      const currentDashboard = userConfig.dashboards.filter((dashboard: any) => dashboard.name == name)[0]
      setDashboardState({dashboard: currentDashboard});
    }
  };

  /**
   * Enable the edit mode on a dashboard
   */
  const toggleEditMode = () => {
    const newState = workspaceState.displaying === workspaceStates.DISPLAY_DASHBOARD ?
      workspaceStates.EDIT_DASHBOARD : workspaceStates.DISPLAY_DASHBOARD;  
    setWorkspaceState({ displaying: newState, name: workspaceState.name })

    // @TODO: Discard or save changes if dashboard state has been changed...
  }

  const displaySider = () => {
    if (workspaceState.displaying === workspaceStates.EDIT_DASHBOARD) {
      return <EditModeSider 
        userConfig={userConfig}
        setUserConfig={setUserConfig}
        userConfigQueryInput={userConfigQueryInput}
        setUserConfigQueryInput={setUserConfigQueryInput}
        dashboardState={dashboardState}
        setDashboardState={setDashboardState}
      />
    }
    return <NavigationSider
      key={"sideBar"}
      baseTableNames={tableNames}
      dashboardNames={dashboardNames}
      baseTableOnClick={(name: string) => {
        displayBaseTable(name);
      }}
      dashboardOnClick={(name: string) => {
        displayDashboard(name, userConfig);
      }}
    />
  }

  return (
    <Layout
      style={{
        height: "100vh",
      }}
    >
      { isSuccessConfig ? (
        <>
      <AppHeader 
        userConfig={userConfig}
        setUserConfig={setUserConfig}
        userConfigQueryInput={userConfigQueryInput}
        setUserConfigQueryInput={setUserConfigQueryInput}
        workspaceState={workspaceState}
        toggleEditMode={toggleEditMode}
      />
      <ManageDashboardsModal
        isVisible={manageDashboardsModalState.visible}
        setVisible={
          (visible: boolean) => setManageDashboardsModalState(
            { visible: visible, type: manageDashboardsModalState.type }
          )
        }
        dashboardNames={dashboardNames}
        dashboardAddKey={dashboardAddKey}
        dashboardRemoveKey={dashboardRemoveKey}
        setDashboardNames={setDashboardNames}
        tableNames={tableNames}
        modalType={manageDashboardsModalState.type}
        hasuraProps={hasuraProps}
        userConfig={userConfig}
        setUserConfig={setUserConfig}
        userConfigQueryInput={userConfigQueryInput}
        setUserConfigQueryInput={setUserConfigQueryInput}
      />
      {
        editElementModalState.visible ?
          <EditElementModal
            state={editElementModalState}
            setState={setEditElementModalState}
          /> : <></>
      }

      <Layout>
        {siderState.tableNamesState == siderMenuState.LOADING ? (
          <Loader />
        ) : (
          displaySider()
        )}
        <Layout
          style={{
            padding: "0 24px 24px",
          }}
        >
          <Content
            className="site-layout-background"
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
            }}
          >
            <Workspace
              key={"workspace"}
              workspaceState={workspaceState}
              hasuraProps={hasuraProps}
              systemProps={systemProps}
              userConfig={userConfig}
              setUserConfig={setUserConfig}
              dashboardState={dashboardState}
              setDashboardState={setDashboardState}
              setEditElementModalState={setEditElementModalState}
              userConfigQueryInput={userConfigQueryInput}
              setUserConfigQueryInput={setUserConfigQueryInput}
            />
          </Content>
        </Layout>
      </Layout>
      </>
    ) : <></> }
    </Layout>
  );
}

// Make sure this page is protected
App.auth = true;

export async function getServerSideProps(context: any) {
  const hasuraProps = {
    hasuraSecret: process.env.NEXT_PUBLIC_HASURA_GRAPHQL_ADMIN_SECRET as String,
    hasuraEndpoint: process.env.NEXT_PUBLIC_HASURA_GRAPHQL_ENDPOINT as
      | RequestInfo
      | URL,
  };
  const systemProps = {
    mediaDisplaySetting: process.env.URL_DISPLAY_SETTING as String
  };
  return {
    props: {
      hasuraProps,
      systemProps,
      ...(await serverSideTranslations(context.locale, ["common"])),
    },
  };
}
