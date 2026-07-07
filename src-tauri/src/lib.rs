use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager,
};
use thiserror::Error;

const MAX_RECENT_FILES: usize = 12;

#[derive(Debug, Error)]
enum AppError {
    #[error("only Markdown files can be opened or saved")]
    InvalidExtension,
    #[error("file does not exist")]
    MissingFile,
    #[error("could not read file: {0}")]
    Read(String),
    #[error("could not write file: {0}")]
    Write(String),
    #[error("could not access app data: {0}")]
    AppData(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize)]
struct LoadedFile {
    path: String,
    contents: String,
}

#[tauri::command]
fn open_file_dialog() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkdn"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file_dialog(default_path: String) -> Option<String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .set_file_name(normalize_save_name(&default_path));
    dialog
        .save_file()
        .map(|path| ensure_md_extension(path).to_string_lossy().to_string())
}

#[tauri::command]
fn read_markdown_file(path: String) -> Result<LoadedFile, AppError> {
    let path = PathBuf::from(path);
    validate_markdown_path(&path)?;
    if !path.exists() {
        return Err(AppError::MissingFile);
    }
    let contents = fs::read_to_string(&path).map_err(|error| AppError::Read(error.to_string()))?;
    remember_recent_file(&path)?;
    Ok(LoadedFile {
        path: path.to_string_lossy().to_string(),
        contents,
    })
}

#[tauri::command]
fn save_markdown_file(path: String, contents: String) -> Result<(), AppError> {
    let path = ensure_md_extension(PathBuf::from(path));
    validate_markdown_path(&path)?;
    fs::write(&path, contents).map_err(|error| AppError::Write(error.to_string()))?;
    remember_recent_file(&path)?;
    Ok(())
}

#[tauri::command]
fn recent_files_get() -> Vec<String> {
    let Ok(contents) = fs::read_to_string(recent_files_path()) else {
        return Vec::new();
    };
    let Ok(files) = serde_json::from_str::<Vec<String>>(&contents) else {
        return Vec::new();
    };
    files
        .into_iter()
        .filter(|file| Path::new(file).exists())
        .take(MAX_RECENT_FILES)
        .collect()
}

#[tauri::command]
fn recent_files_set(files: Vec<String>) -> Result<(), AppError> {
    write_recent_files(files)
}

#[tauri::command]
fn startup_markdown_files() -> Vec<String> {
    std::env::args()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| path.exists() && is_markdown_path(path))
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if matches!(
                id,
                "new"
                    | "open"
                    | "save"
                    | "save-as"
                    | "print"
                    | "find"
                    | "h1"
                    | "h2"
                    | "bold"
                    | "italic"
                    | "bullet-list"
                    | "quote"
                    | "code-block"
                    | "link"
                    | "table"
                    | "about"
            ) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval(format!(
                        "window.__markdownPadRunCommand && window.__markdownPadRunCommand({id:?});"
                    ));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            save_file_dialog,
            read_markdown_file,
            save_markdown_file,
            recent_files_get,
            recent_files_set,
            startup_markdown_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Markdown Pad");
}

fn build_app_menu<R: tauri::Runtime>(handle: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file = Submenu::with_items(
        handle,
        "&File",
        true,
        &[
            &menu_item(handle, "new", "&New", "Ctrl+N")?,
            &menu_item(handle, "open", "&Open...", "Ctrl+O")?,
            &PredefinedMenuItem::separator(handle)?,
            &menu_item(handle, "save", "&Save", "Ctrl+S")?,
            &menu_item(handle, "save-as", "Save &As...", "Ctrl+Shift+S")?,
            &PredefinedMenuItem::separator(handle)?,
            &menu_item(handle, "print", "&Print...", "Ctrl+P")?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, Some("E&xit"))?,
        ],
    )?;

    let edit = Submenu::with_items(
        handle,
        "&Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, Some("&Undo"))?,
            &PredefinedMenuItem::redo(handle, Some("&Redo"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, Some("Cu&t"))?,
            &PredefinedMenuItem::copy(handle, Some("&Copy"))?,
            &PredefinedMenuItem::paste(handle, Some("&Paste"))?,
            &PredefinedMenuItem::select_all(handle, Some("Select &All"))?,
            &PredefinedMenuItem::separator(handle)?,
            &menu_item(handle, "find", "&Find", "Ctrl+F")?,
        ],
    )?;

    let format = Submenu::with_items(
        handle,
        "F&ormat",
        true,
        &[
            &menu_item(handle, "h1", "Heading &1", "Ctrl+Alt+1")?,
            &menu_item(handle, "h2", "Heading &2", "Ctrl+Alt+2")?,
            &PredefinedMenuItem::separator(handle)?,
            &menu_item(handle, "bold", "&Bold", "Ctrl+B")?,
            &menu_item(handle, "italic", "&Italic", "Ctrl+I")?,
            &PredefinedMenuItem::separator(handle)?,
            &menu_item(handle, "bullet-list", "&Bullet List", "Ctrl+Shift+8")?,
            &menu_item(handle, "quote", "Bloc&k Quote", "Ctrl+Shift+Q")?,
            &menu_item(handle, "code-block", "&Code Block", "Ctrl+Shift+C")?,
            &menu_item(handle, "link", "&Link", "Ctrl+K")?,
            &menu_item(handle, "table", "&Table", "Ctrl+Shift+T")?,
        ],
    )?;

    let help = Submenu::with_items(
        handle,
        "&Help",
        true,
        &[&menu_item(handle, "about", "&About Markdown Pad", "F1")?],
    )?;

    Menu::with_items(handle, &[&file, &edit, &format, &help])
}

fn menu_item<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
    id: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(handle, id, text, true, Some(accelerator))
}

fn validate_markdown_path(path: &Path) -> Result<(), AppError> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        Err(AppError::InvalidExtension)
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkdn"
            )
        })
        .unwrap_or(false)
}

fn ensure_md_extension(path: PathBuf) -> PathBuf {
    if path.extension().is_some() {
        path
    } else {
        path.with_extension("md")
    }
}

fn normalize_save_name(default_path: &str) -> String {
    Path::new(default_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled.md")
        .to_string()
}

fn remember_recent_file(path: &Path) -> Result<(), AppError> {
    let canonical = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string();
    let mut files = recent_files_get();
    files.retain(|file| file != &canonical);
    files.insert(0, canonical);
    files.truncate(MAX_RECENT_FILES);
    write_recent_files(files)
}

fn write_recent_files(files: Vec<String>) -> Result<(), AppError> {
    let path = recent_files_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::AppData(error.to_string()))?;
    }
    fs::write(
        path,
        serde_json::to_string_pretty(&files).unwrap_or_default(),
    )
    .map_err(|error| AppError::AppData(error.to_string()))
}

fn recent_files_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Markdown Pad")
        .join("recent-files.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_extensions_are_accepted_case_insensitively() {
        for file in [
            "note.md",
            "note.MD",
            "note.markdown",
            "note.mdown",
            "note.mkdn",
        ] {
            assert!(
                is_markdown_path(Path::new(file)),
                "{file} should be accepted"
            );
        }
    }

    #[test]
    fn non_markdown_extensions_are_rejected() {
        for file in ["note.txt", "note.docx", "note", ".md"] {
            assert!(
                !is_markdown_path(Path::new(file)),
                "{file} should be rejected"
            );
        }
    }

    #[test]
    fn ensure_md_extension_adds_extension_only_when_missing() {
        assert_eq!(
            ensure_md_extension(PathBuf::from("note")).as_path(),
            Path::new("note.md")
        );
        assert_eq!(
            ensure_md_extension(PathBuf::from("note.markdown")).as_path(),
            Path::new("note.markdown")
        );
    }

    #[test]
    fn normalize_save_name_extracts_filename() {
        assert_eq!(normalize_save_name("Notes/today.md"), "today.md");
        assert_eq!(normalize_save_name("today.md"), "today.md");
    }

    #[test]
    fn validate_markdown_path_reports_invalid_extensions() {
        assert!(validate_markdown_path(Path::new("good.md")).is_ok());
        assert!(matches!(
            validate_markdown_path(Path::new("bad.txt")),
            Err(AppError::InvalidExtension)
        ));
    }
}
