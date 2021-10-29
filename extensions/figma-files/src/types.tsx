interface Project {
  id: string
  name: string
}

export interface TeamProjects {
  name: string
  projects: Project[]
}

export interface ProjectFiles {
  files: File[]
  name: string
}

export interface File {
  key: string
  last_modified: string
  name: string
  thumbnail_url: string
}

export interface FileDetail {
  document: Node
}

export interface Node {
  id: string
  name: string
  children: Node[]
}
