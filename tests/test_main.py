from src.main import main


def test_main(capsys):
    main()
    captured = capsys.readouterr()
    assert "Q Hack 2026" in captured.out
