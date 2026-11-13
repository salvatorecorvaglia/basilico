//! Exercise the real editor launcher in a child process, so a private test PATH
//! never affects concurrent Git commands or the user's application settings.
#[cfg(unix)]
mod unix {
    use basilico_lib::test_utils::TempRepo;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn editor_launcher_preserves_arguments_and_reports_silent_failures() {
        let repo = TempRepo::new();
        repo.write_file("path with spaces.txt", "disposable editor fixture\n");
        let bin = repo.path.join("bin");
        std::fs::create_dir(&bin).unwrap();
        let shim = bin.join("code");
        std::fs::write(&shim, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$BASILICO_EDITOR_ARGUMENTS\"\nexit \"$BASILICO_EDITOR_EXIT\"\n").unwrap();
        std::fs::set_permissions(&shim, std::fs::Permissions::from_mode(0o755)).unwrap();
        let args_file = repo.path.join("arguments");
        for code in [0, 9] {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--ignored", "--exact", "unix::editor_child"])
                .env(
                    "PATH",
                    format!(
                        "{}:{}",
                        bin.display(),
                        std::env::var("PATH").unwrap_or_default()
                    ),
                )
                .env("BASILICO_EDITOR_REPO", &repo.path)
                .env("BASILICO_EDITOR_ARGUMENTS", &args_file)
                .env("BASILICO_EDITOR_EXIT", code.to_string())
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stdout)
            );
            assert_eq!(
                std::fs::read_to_string(&args_file).unwrap(),
                format!(
                    "-g\n{}:42\n",
                    repo.path.join("path with spaces.txt").display()
                )
            );
        }
    }

    #[tokio::test]
    #[ignore = "invoked only by the isolated editor-launcher test"]
    async fn editor_child() {
        let root = std::env::var("BASILICO_EDITOR_REPO").expect("run the parent editor test");
        let result = basilico_lib::commands::ide::open_in_ide(
            "path with spaces.txt".into(),
            Some(42),
            Some("code".into()),
            Some(root),
        )
        .await;
        if std::env::var("BASILICO_EDITOR_EXIT").unwrap() == "0" {
            result.unwrap();
        } else {
            assert!(
                result.is_err(),
                "a nonzero editor exit must not be reported as success, even without stderr"
            );
        }
    }
}
