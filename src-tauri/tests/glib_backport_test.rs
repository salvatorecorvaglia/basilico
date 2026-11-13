//! Regression for the optimizer-sensitive out-pointer bug RUSTSEC-2024-0429.
#[cfg(target_os = "linux")]
#[test]
fn glib_string_variant_iteration_is_sound_in_both_directions() {
    use glib::variant::ToVariant;
    let value = vec!["alpha", "beta", "gamma", "delta"].to_variant();
    let expected = vec!["alpha", "beta", "gamma", "delta"];
    assert_eq!(
        value.array_iter_str().unwrap().collect::<Vec<_>>(),
        expected
    );
    assert_eq!(
        value.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        vec!["delta", "gamma", "beta", "alpha"]
    );
    assert_eq!(value.array_iter_str().unwrap().nth(2), Some("gamma"));
    assert_eq!(value.array_iter_str().unwrap().nth_back(2), Some("beta"));
    assert_eq!(value.array_iter_str().unwrap().last(), Some("delta"));
    let mut iter = value.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some("alpha"));
    assert_eq!(iter.next_back(), Some("delta"));
    assert_eq!(iter.len(), 2);
    assert_eq!(iter.collect::<Vec<_>>(), vec!["beta", "gamma"]);
    assert!(Vec::<String>::new()
        .to_variant()
        .array_iter_str()
        .unwrap()
        .next()
        .is_none());
}
