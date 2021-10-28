import {
  ActionPanel,
  List,
  OpenInBrowserAction,
  showToast,
  ToastStyle,
  getPreferenceValues,
  environment,
  Icon,
  CopyToClipboardAction,
  OpenAction,
  Application,
  getApplications,
} from "@raycast/api"
import TimeAgo from "javascript-time-ago"
import en from "javascript-time-ago/locale/en.json"
import fetch from "node-fetch"
import { useState, useEffect } from "react"
import { loadFiles, storeFiles, clearFiles, loadPages, storePages } from "./cache"
import { ProjectFiles, File, TeamProjects, FileDetail, Node } from "./types"

TimeAgo.addDefaultLocale(en)
const timeAgo = new TimeAgo("en-US")

export default function FileList() {
  const [state, setState] = useState<{ projectFiles: ProjectFiles[]; isLoading: boolean }>({
    projectFiles: [],
    isLoading: true,
  })

  useEffect(() => {
    async function fetch() {
      const cachedFiles = await loadFiles()

      if (cachedFiles) {
        setState((oldState) => ({ ...oldState, projectFiles: cachedFiles }))
      }

      const newFiles = await fetchFiles()

      setState((oldState) => ({
        ...oldState,
        projectFiles: newFiles,
        isLoading: false,
      }))

      await storeFiles(newFiles)
    }
    fetch()
  }, [])

  return (
    <List isLoading={state.isLoading} searchBarPlaceholder="Filter files by name...">
      {state.projectFiles.map((project) => (
        <List.Section key={project.name} title={project.name}>
          {project.files.map((file) => (
            <FileListItem key={file.key} file={file} />
          ))}
        </List.Section>
      ))}
    </List>
  )
}

function FileListItem(props: { file: File }) {
  const { file } = props

  const accessoryTitle = String(timeAgo.format(new Date(file.last_modified)))
  return (
    <List.Item
      id={file.key}
      key={file.key}
      title={file.name}
      icon={file.thumbnail_url}
      accessoryTitle={accessoryTitle}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <OpenProjectFileAction file={props.file} />
            <CopyToClipboardAction content={`https://figma.com/file/${file.key}`} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <OpenPageSubmenuAction file={file} />
          </ActionPanel.Section>
          <DevelopmentActionSection />
        </ActionPanel>
      }
    />
  )
}

function OpenProjectFileAction(props: { file: File }) {
  const [desktopApp, setDesktopApp] = useState<Application>()

  useEffect(() => {
    getApplications()
      .then((apps) => apps.find((a) => a.bundleId === "com.figma.Desktop"))
      .then(setDesktopApp)
  }, [])

  return desktopApp ? (
    <OpenAction
      icon="command-icon.png"
      title="Open in Figma"
      target={`figma://file/${props.file.key}`}
      application={desktopApp}
    />
  ) : (
    <OpenInBrowserAction url={`https://figma.com/file/${props.file.key}`} />
  )
}

function DevelopmentActionSection() {
  async function handleClearCache() {
    const toast = await showToast(ToastStyle.Animated, "Clearing cache")

    try {
      await clearFiles()
      toast.style = ToastStyle.Success
      toast.title = "Cleared cache"
    } catch (error) {
      toast.style = ToastStyle.Failure
      toast.title = "Failed clearing cache"
      toast.message = error instanceof Error ? error.message : undefined
    }
  }

  return environment.isDevelopment ? (
    <ActionPanel.Section title="Development">
      <ActionPanel.Item icon={Icon.Trash} title="Clear Cache" onAction={handleClearCache} />
    </ActionPanel.Section>
  ) : null
}

function OpenPageSubmenuAction(props: { file: File }) {
  const [pages, setPages] = useState<Node[]>()

  useEffect(() => {
    console.debug("Fetch pages...")
    fetchPages(props.file).then(setPages)
    async function fetch() {
      const cachedPages = await loadPages(props.file)

      if (cachedPages) {
        setPages(cachedPages)
      }

      const newPages = await fetchPages(props.file)
      setPages(newPages)

      await storePages(newPages, props.file)
    }

    fetch()
  }, [props.file])

  return (
    <ActionPanel.Submenu icon={Icon.Document} title="Open Page" shortcut={{ modifiers: ["cmd"], key: "p" }}>
      {pages?.map((p) => (
        <OpenInBrowserAction key={p.id} title={p.name} url={`figma://file/${props.file.key}?node-id=${p.id}`} />
      ))}
    </ActionPanel.Submenu>
  )
}

async function fetchTeamProjects(): Promise<TeamProjects> {
  const { PERSONAL_ACCESS_TOKEN, TEAM_ID } = getPreferenceValues()
  try {
    const response = await fetch(`https://api.figma.com/v1/teams/${TEAM_ID}/projects`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
      },
    })

    const json = (await response.json()) as TeamProjects
    return json
  } catch (error) {
    console.error(error)
    showToast(ToastStyle.Failure, "Could not load team")
    return Promise.resolve({ name: "No team found", projects: [] })
  }
}

async function fetchFiles(): Promise<ProjectFiles[]> {
  const { PERSONAL_ACCESS_TOKEN } = getPreferenceValues()
  const teamProjects = await fetchTeamProjects()
  const projects = teamProjects.projects.map(async (project) => {
    try {
      const response = await fetch(`https://api.figma.com/v1/projects/${project.id}/files`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
        },
      })

      const json = (await response.json()) as ProjectFiles
      return { name: project.name, files: json.files as File[] }
    } catch (error) {
      console.error(error)
      showToast(ToastStyle.Failure, "Could not load files")
      return Promise.resolve([])
    }
  })

  return Promise.all(projects) as Promise<ProjectFiles[]>
}

async function fetchPages(file: File): Promise<Node[]> {
  const { PERSONAL_ACCESS_TOKEN } = getPreferenceValues()

  try {
    const response = await fetch(`https://api.figma.com/v1/files/${file.key}?depth=1`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
      },
    })

    const json = (await response.json()) as FileDetail
    return json.document.children
  } catch (error) {
    console.error(error)
    showToast(ToastStyle.Failure, "Could not load pages")
    return Promise.resolve([])
  }
}
